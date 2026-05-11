import initSqlJs from 'sql.js';
import { canonicalDomainFromPayload } from './domainSlug';

const defaultLocateFile = (file) => `${import.meta.env.BASE_URL}${file}`;

/**
 * @param {import('sql.js').Database} db
 * @returns {Map<number, string>}
 */
function crawlRunStartUrlsMap(db) {
  const m = new Map();
  try {
    const runRows = db.exec('SELECT id, start_url FROM crawl_runs');
    if (!runRows.length || !runRows[0].values.length) return m;
    const cols = runRows[0].columns;
    const idIdx = cols.indexOf('id');
    const urlIdx = cols.indexOf('start_url');
    for (const row of runRows[0].values) {
      m.set(Number(row[idIdx]), String(row[urlIdx] || ''));
    }
  } catch {
    /* crawl_runs may be missing */
  }
  return m;
}

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
 * Open SQLite from an ArrayBuffer (e.g. after fetch).
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Promise<import('sql.js').Database>}
 */
export async function openReportDatabaseFromArrayBuffer(arrayBuffer) {
  const SQL = await initSqlJs({ locateFile: defaultLocateFile });
  return new SQL.Database(new Uint8Array(arrayBuffer));
}

/**
 * @param {import('sql.js').Database} db
 * @returns {Array<{ id: number, generated_at: string, site_name: string, canonical_domain: string }>}
 */
export function listReportsFromDatabase(db) {
  const startUrlByRunId = crawlRunStartUrlsMap(db);
  try {
    const res = db.exec('SELECT id, generated_at, data FROM report_payload ORDER BY id DESC');
    if (!res.length || !res[0].values.length) return [];
    const cols = res[0].columns;
    const idIdx = cols.indexOf('id');
    const atIdx = cols.indexOf('generated_at');
    const dataIdx = cols.indexOf('data');
    return res[0].values.map((row) => {
      let parsed = {};
      try {
        parsed = JSON.parse(String(row[dataIdx] ?? '{}'));
      } catch {
        parsed = {};
      }
      const siteName = parsed?.site_name != null ? String(parsed.site_name) : '';
      const canonical_domain = canonicalDomainFromPayload(parsed, startUrlByRunId);
      return {
        id: row[idIdx],
        generated_at: row[atIdx],
        site_name: siteName,
        canonical_domain,
      };
    });
  } catch {
    return listReportsFromDatabaseFallback(db, startUrlByRunId);
  }
}

/**
 * @param {import('sql.js').Database} db
 * @param {Map<number, string>} startUrlByRunId
 * @returns {Array<{ id: number, generated_at: string, site_name: string, canonical_domain: string }>}
 */
function listReportsFromDatabaseFallback(db, startUrlByRunId) {
  try {
    const res = db.exec('SELECT id, generated_at, data FROM report_payload ORDER BY id DESC');
    if (!res.length || !res[0].values.length) return [];
    const cols = res[0].columns;
    const idIdx = cols.indexOf('id');
    const atIdx = cols.indexOf('generated_at');
    const dataIdx = cols.indexOf('data');
    return res[0].values.map((row) => {
      let parsed = {};
      try {
        parsed = JSON.parse(String(row[dataIdx] ?? '{}'));
      } catch {
        parsed = {};
      }
      const siteName = parsed?.site_name != null ? String(parsed.site_name) : '';
      return {
        id: row[idIdx],
        generated_at: row[atIdx],
        site_name: siteName,
        canonical_domain: canonicalDomainFromPayload(parsed, startUrlByRunId),
      };
    });
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
 * @returns {Promise<Array<{ id: number, generated_at: string, site_name: string, canonical_domain: string }>>}
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
