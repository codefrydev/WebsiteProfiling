import { canonicalDomainFromPayload } from './domainSlug';

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
 * Crawl run rows for API / client context (server reads DB).
 * @param {import('sql.js').Database} db
 * @returns {Array<{ id: number, start_url: string, created_at: string }>}
 */
export function getCrawlRunsRows(db) {
  const rows = [];
  try {
    const res = db.exec('SELECT id, start_url, created_at FROM crawl_runs');
    if (!res.length || !res[0].values.length) return rows;
    const cols = res[0].columns;
    const idIdx = cols.indexOf('id');
    const urlIdx = cols.indexOf('start_url');
    const createdIdx = cols.indexOf('created_at');
    for (const row of res[0].values) {
      rows.push({
        id: Number(row[idIdx]),
        start_url: String(row[urlIdx] || ''),
        created_at: String(row[createdIdx] || ''),
      });
    }
  } catch {
    /* table may be missing */
  }
  return rows;
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
 * Latest google_data row, payload-safe (no gsc_full / ga4_full blobs).
 * @param {import('sql.js').Database} db
 * @returns {object | null}
 */
export function readLatestGooglePayload(db) {
  try {
    const res = db.exec('SELECT data FROM google_data ORDER BY id DESC LIMIT 1');
    if (!res.length || !res[0].values.length) return null;
    const raw = JSON.parse(String(res[0].values[0][0] ?? '{}'));
    if (!raw || typeof raw !== 'object') return null;
    const { gsc_full: _gscFull, ga4_full: _ga4Full, ...payload } = raw;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Latest keyword_data snapshot for report payload merge.
 * @param {import('sql.js').Database} db
 * @returns {object | null}
 */
export function readLatestKeywordPayload(db) {
  try {
    const res = db.exec('SELECT data FROM keyword_data ORDER BY id DESC LIMIT 1');
    if (!res.length || !res[0].values.length) return null;
    const raw = JSON.parse(String(res[0].values[0][0] ?? '{}'));
    if (!raw || typeof raw !== 'object') return null;
    const rows = Array.isArray(raw.rows) ? raw.rows : [];
    if (rows.length > 1000) {
      return { ...raw, rows: rows.slice(0, 1000) };
    }
    return raw;
  } catch {
    return null;
  }
}

/**
 * Overlay latest sidecar tables onto a report payload (google fetch / keywords
 * update the dedicated tables without rebuilding report_payload).
 * @param {import('sql.js').Database} db
 * @param {object} payload
 * @returns {object}
 */
export function mergeSidecarPayloadData(db, payload) {
  const merged = { ...payload };
  const google = readLatestGooglePayload(db);
  if (google) merged.google = google;
  const keywords = readLatestKeywordPayload(db);
  if (keywords) merged.keywords = keywords;
  return merged;
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
  const payload = JSON.parse(dataJson);
  return mergeSidecarPayloadData(db, payload);
}
