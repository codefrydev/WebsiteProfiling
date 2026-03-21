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
  return openReportDatabaseFromArrayBuffer(buf);
}

/**
 * Open SQLite from an ArrayBuffer (e.g. local file in Model Lab).
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Promise<import('sql.js').Database>}
 */
export async function openReportDatabaseFromArrayBuffer(arrayBuffer) {
  const SQL = await initSqlJs({ locateFile: defaultLocateFile });
  return new SQL.Database(new Uint8Array(arrayBuffer));
}

/**
 * Introspect tables/columns/row counts for LLM tools (read-only).
 * @param {import('sql.js').Database} db
 * @param {{ maxTables?: number, maxColumnsPerTable?: number }} [opts]
 * @returns {{ tables: Array<{ name: string, columns: Array<{ name: string, type: string, notnull: number, pk: number }>, row_count: number | null }>, truncated?: boolean }}
 */
export function introspectDatabaseSchema(db, opts = {}) {
  const maxTables = opts.maxTables ?? 48;
  const maxCols = opts.maxColumnsPerTable ?? 64;
  const tables = [];
  let listRes;
  try {
    listRes = db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );
  } catch {
    return { tables: [], error: 'Could not read sqlite_master.' };
  }
  if (!listRes.length || !listRes[0].values.length) return { tables: [] };
  const rawNames = listRes[0].values.map((row) => String(row[0]));
  const truncated = rawNames.length > maxTables;
  const names = rawNames.slice(0, maxTables);
  for (const tableName of names) {
    const safe = String(tableName).replace(/"/g, '""');
    /** @type {Array<{ name: string, type: string, notnull: number, pk: number }>} */
    let columns = [];
    try {
      const pragma = db.exec(`PRAGMA table_info("${safe}")`);
      if (pragma.length && pragma[0].values.length) {
        const pi = pragma[0].columns;
        const idxName = pi.indexOf('name');
        const idxType = pi.indexOf('type');
        const idxNotnull = pi.indexOf('notnull');
        const idxPk = pi.indexOf('pk');
        for (const row of pragma[0].values.slice(0, maxCols)) {
          columns.push({
            name: String(row[idxName >= 0 ? idxName : 1] ?? ''),
            type: String(row[idxType >= 0 ? idxType : 2] ?? ''),
            notnull: Number(row[idxNotnull >= 0 ? idxNotnull : 3] ?? 0) || 0,
            pk: Number(row[idxPk >= 0 ? idxPk : 5] ?? 0) || 0,
          });
        }
      }
    } catch {
      columns = [];
    }
    let rowCount = null;
    try {
      const cnt = db.exec(`SELECT COUNT(*) AS c FROM "${safe}"`);
      if (cnt.length && cnt[0].values.length) {
        const ci = cnt[0].columns.indexOf('c');
        rowCount = Number(cnt[0].values[0][ci >= 0 ? ci : 0]) || 0;
      }
    } catch {
      rowCount = null;
    }
    tables.push({ name: tableName, columns, row_count: rowCount });
  }
  return truncated ? { tables, truncated: true } : { tables };
}

/**
 * Compact JSON text of schema for LLM system prompts (tables, columns, row counts).
 * @param {import('sql.js').Database} db
 * @param {{ maxChars?: number }} [opts]
 * @returns {string}
 */
export function formatDatabaseSchemaForPrompt(db, opts = {}) {
  const maxChars = opts.maxChars ?? 8000;
  const res = introspectDatabaseSchema(db);
  const payload = {
    tables: res.tables,
    ...(res.truncated ? { truncated: true } : {}),
    ...(res.error ? { error: res.error } : {}),
  };
  let text = JSON.stringify(payload, null, 2);
  if (text.length > maxChars) {
    text = text.slice(0, Math.max(0, maxChars - 40)) + '\n[… truncated …]';
  }
  return text;
}

/**
 * Markdown block for the audit schema (same block appended in Model Lab system prompts).
 * @param {string} schemaText - from formatDatabaseSchemaForPrompt
 * @returns {string}
 */
export function formatLabSchemaMarkdownBlock(schemaText) {
  const s = (schemaText || '').trim();
  if (!s) return '';
  return (
    '## Audit database (SQLite)\n' +
    'Tables, columns, and row counts. Use this to reason about how crawl, Lighthouse, and report data is stored.\n\n' +
    '```json\n' +
    s +
    '\n```'
  );
}

/**
 * Append schema JSON block to optional user system instructions (Model Lab).
 * @param {string} userInstruction
 * @param {string} schemaText - from formatDatabaseSchemaForPrompt; if empty, returns trimmed instruction only
 * @returns {string}
 */
export function buildLabChatSystemWithSchema(userInstruction, schemaText) {
  const u = (userInstruction || '').trim();
  const block = formatLabSchemaMarkdownBlock(schemaText);
  if (!block) return u;
  return u ? `${u}\n\n${block}` : block;
}

/**
 * Merge schema into an existing system string (e.g. curl body already had systemInstruction).
 * @param {string} existingSystemText - text already in the API template
 * @param {string} userInstruction - Settings → system instructions
 * @param {string} schemaText - from formatDatabaseSchemaForPrompt; empty skips schema
 * @returns {string}
 */
export function mergeLabSystemWithSchema(existingSystemText, userInstruction, schemaText) {
  const block = formatLabSchemaMarkdownBlock(schemaText);
  if (!block) {
    return (existingSystemText || '').trim() || (userInstruction || '').trim();
  }
  const base = (existingSystemText || '').trim() || (userInstruction || '').trim();
  return base ? `${base}\n\n${block}` : block;
}

/**
 * Sample Lighthouse audit rows (lh_audits).
 * @param {import('sql.js').Database} db
 * @param {number} limit
 * @param {number|null} runId - filter by lighthouse_runs.id when set
 * @returns {Array<Record<string, unknown>>}
 */
export function queryLighthouseAuditsSample(db, limit = 25, runId = null) {
  try {
    const chk = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='lh_audits'");
    if (!chk.length || !chk[0].values.length) return [];
    const lim = Math.min(Math.max(1, limit), 200);
    const cols = [
      'id',
      'run_id',
      'audit_id',
      'category_id',
      'score',
      'title',
      'display_value',
      'numeric_value',
    ];
    let sql = `SELECT ${cols.join(', ')} FROM lh_audits`;
    const params = [];
    if (runId != null && Number.isFinite(Number(runId))) {
      sql += ' WHERE run_id = ?';
      params.push(Number(runId));
    }
    sql += ' ORDER BY id LIMIT ?';
    params.push(lim);
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const out = [];
    while (stmt.step()) {
      const row = stmt.get();
      const obj = {};
      cols.forEach((c, i) => {
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
 * Sample nodes table (url inlink counts per crawl run).
 * @param {import('sql.js').Database} db
 * @param {number} limit
 * @returns {Array<Record<string, unknown>>}
 */
export function queryNodesSample(db, limit = 40) {
  try {
    const chk = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='nodes'");
    if (!chk.length || !chk[0].values.length) return [];
    const lim = Math.min(Math.max(1, limit), 500);
    const stmt = db.prepare(
      'SELECT crawl_run_id, url, count FROM nodes ORDER BY count DESC LIMIT ?'
    );
    stmt.bind([lim]);
    const out = [];
    while (stmt.step()) {
      const row = stmt.get();
      out.push({ crawl_run_id: row[0], url: row[1], count: row[2] });
    }
    stmt.free();
    return out;
  } catch {
    return [];
  }
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
    const want = [
      'url',
      'title',
      'h1',
      'meta_description',
      'content_excerpt',
      'status',
      'word_count',
      'content_length',
    ].filter((c) => cols.includes(c));
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
