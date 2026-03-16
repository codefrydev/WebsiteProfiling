import initSqlJs from 'sql.js';

/**
 * Load report payload from SQLite report.db (fetched from dbUrl).
 * Returns the parsed JSON from report_payload.data (latest row).
 * @param {string} dbUrl - URL to report.db (e.g. '/report.db' or with BASE_URL)
 * @returns {Promise<object>} Report payload object
 */
export function loadReportFromDb(dbUrl) {
  return fetch(dbUrl)
    .then((r) => {
      if (!r.ok) throw new Error(`Failed to fetch report DB: ${r.status}`);
      return r.arrayBuffer();
    })
    .then((buf) => {
      return initSqlJs({
        // Serve WASM from same origin (public/sql-wasm-browser.wasm) so it works with base path and dev server
        locateFile: (file) => `${import.meta.env.BASE_URL}${file}`,
      }).then((SQL) => {
        const db = new SQL.Database(new Uint8Array(buf));
        const res = db.exec(
          'SELECT data FROM report_payload ORDER BY id DESC LIMIT 1'
        );
        db.close();
        if (!res.length || !res[0].values.length)
          throw new Error('No report_payload in DB');
        return JSON.parse(res[0].values[0][0]);
      });
    });
}
