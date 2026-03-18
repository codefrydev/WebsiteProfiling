import initSqlJs from 'sql.js';

const defaultLocateFile = (file) => `${import.meta.env.BASE_URL}${file}`;

function openDb(dbUrl) {
  return fetch(dbUrl)
    .then((r) => {
      if (!r.ok) throw new Error(`Failed to fetch report DB: ${r.status}`);
      return r.arrayBuffer();
    })
    .then((buf) =>
      initSqlJs({ locateFile: defaultLocateFile }).then((SQL) => new SQL.Database(new Uint8Array(buf)))
    );
}

/**
 * List report payload rows (id, generated_at) from report.db, newest first.
 * @param {string} dbUrl - URL to report.db
 * @returns {Promise<Array<{ id: number, generated_at: string }>>}
 */
export function listReportsFromDb(dbUrl) {
  return openDb(dbUrl).then((db) => {
    try {
      const res = db.exec('SELECT id, generated_at FROM report_payload ORDER BY id DESC');
      db.close();
      if (!res.length || !res[0].values.length) return [];
      const cols = res[0].columns;
      const idIdx = cols.indexOf('id');
      const atIdx = cols.indexOf('generated_at');
      return res[0].values.map((row) => ({ id: row[idIdx], generated_at: row[atIdx] }));
    } catch (e) {
      db.close();
      throw e;
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
  return openDb(dbUrl).then((db) => {
    try {
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
      db.close();
      if (dataJson == null)
        throw new Error(reportId != null ? 'Report not found' : 'No report_payload in DB');
      return JSON.parse(dataJson);
    } catch (e) {
      db.close();
      throw e;
    }
  });
}
