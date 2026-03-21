import initSqlJs from 'sql.js';

const defaultLocateFile = (file) => `${import.meta.env.BASE_URL}${file}`;

/**
 * Fetch report.db and open an in-memory SQL.js database. Caller must db.close() when done.
 * @param {string} dbUrl
 * @returns {Promise<import('sql.js').Database>}
 */
export async function openReportDatabase(dbUrl) {
  const res = await fetch(dbUrl);
  if (!res.ok) throw new Error(`Failed to fetch report DB: ${res.status}`);
  const buf = await res.arrayBuffer();
  const SQL = await initSqlJs({ locateFile: defaultLocateFile });
  return new SQL.Database(new Uint8Array(buf));
}

/**
 * @param {import('sql.js').Database} db
 * @returns {Array<{ id: number, generated_at: string }>}
 */
export function listReportsFromDatabase(db) {
  try {
    const res = db.exec('SELECT id, generated_at FROM report_payload ORDER BY id DESC');
    if (!res.length || !res[0].values.length) return [];
    const cols = res[0].columns;
    const idIdx = cols.indexOf('id');
    const atIdx = cols.indexOf('generated_at');
    return res[0].values.map((row) => ({ id: row[idIdx], generated_at: row[atIdx] }));
  } catch {
    return [];
  }
}

/**
 * @param {import('sql.js').Database} db
 * @param {number|null} reportId
 * @returns {object}
 */
export function readReportPayloadFromDatabase(db, reportId = null) {
  let dataJson = null;
  if (reportId != null) {
    const stmt = db.prepare('SELECT data FROM report_payload WHERE id = ?');
    stmt.bind([reportId]);
    if (stmt.step()) dataJson = stmt.get()[0];
    stmt.free();
  } else {
    const res = db.exec('SELECT data FROM report_payload ORDER BY id DESC LIMIT 1');
    if (res.length && res[0].values.length) dataJson = res[0].values[0][0];
  }
  if (dataJson == null) {
    throw new Error(reportId != null ? 'Report not found' : 'No report_payload in DB');
  }
  return JSON.parse(dataJson);
}

/**
 * List report payload rows (id, generated_at) from report.db, newest first.
 * @param {string} dbUrl - URL to report.db
 * @returns {Promise<Array<{ id: number, generated_at: string }>>}
 */
export function listReportsFromDb(dbUrl) {
  return openReportDatabase(dbUrl).then((db) => {
    try {
      return listReportsFromDatabase(db);
    } finally {
      db.close();
    }
  });
}

/**
 * Load report payload from SQLite report.db.
 * If reportId is provided, returns that row's data; otherwise returns latest.
 * @param {string} dbUrl - URL to report.db
 * @param {number|null} reportId - optional report_payload.id
 * @returns {Promise<object>} Report payload object
 */
export function loadReportFromDb(dbUrl, reportId = null) {
  return openReportDatabase(dbUrl).then((db) => {
    try {
      return readReportPayloadFromDatabase(db, reportId);
    } finally {
      db.close();
    }
  });
}

/**
 * Return crawl_result rows for Transformers.js / tables (columns vary by crawl version).
 * @param {import('sql.js').Database} db
 * @param {number} limit
 * @returns {Array<Record<string, string|number|null>>}
 */
export function queryCrawlResults(db, limit = 500) {
  try {
    const chk = db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='crawl_results'"
    );
    if (!chk.length || !chk[0].values.length) return [];

    const info = db.exec('PRAGMA table_info(crawl_results)');
    if (!info.length) return [];
    const colRows = info[0].values;
    const cols = colRows.map((r) => r[1]);
    const want = ['url', 'title', 'h1', 'meta_description', 'status', 'word_count', 'content_length'].filter(
      (c) => cols.includes(c)
    );
    if (!want.includes('url')) return [];

    const sql = `SELECT ${want.map((c) => `"${c}"`).join(', ')} FROM crawl_results LIMIT ?`;
    const stmt = db.prepare(sql);
    stmt.bind([Math.min(Math.max(1, limit), 5000)]);
    const out = [];
    while (stmt.step()) {
      const row = stmt.get();
      const obj = {};
      want.forEach((c, i) => {
        obj[c] = row[i];
      });
      out.push(obj);
    }
    stmt.free();
    return out;
  } catch {
    return [];
  }
}

/**
 * Sample edges for SQL-driven views (internal link table).
 * @param {import('sql.js').Database} db
 * @param {number} limit
 * @returns {Array<{ from_url: string, to_url: string }>}
 */
export function queryEdgesSample(db, limit = 400) {
  try {
    const chk = db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='edges'"
    );
    if (!chk.length || !chk[0].values.length) return [];
    const stmt = db.prepare('SELECT from_url, to_url FROM edges LIMIT ?');
    stmt.bind([Math.min(Math.max(1, limit), 5000)]);
    const out = [];
    while (stmt.step()) {
      const row = stmt.get();
      out.push({ from_url: row[0], to_url: row[1] });
    }
    stmt.free();
    return out;
  } catch {
    return [];
  }
}
