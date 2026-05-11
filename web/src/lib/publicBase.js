/**
 * URL prefix when the app is hosted under a subpath (must match next.config `basePath` if set).
 * Empty string = site root (`/`).
 */
export function getPublicBasePath() {
  const p = process.env.NEXT_PUBLIC_BASE_PATH;
  if (p == null || p === '' || p === '/') return '';
  return p.endsWith('/') ? p.slice(0, -1) : p;
}

/**
 * Absolute path from origin (e.g. `/report.db` or `/myapp/report.db` if basePath is set).
 * @param {string} relativePath - e.g. "report.db" or "/report.db"
 */
export function assetUrl(relativePath) {
  const base = getPublicBasePath();
  const path = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  return `${base}${path}`;
}

/** Same-origin generic API path (e.g. `/api/run`). */
export function apiUrl(suffix) {
  const base = getPublicBasePath();
  const s = suffix.startsWith('/') ? suffix : `/${suffix}`;
  return `${base}/api${s}`;
}

/** Report SQLite API (server-side DB reads). */
export function reportApi(suffix) {
  const base = getPublicBasePath();
  const s = suffix.startsWith('/') ? suffix : `/${suffix}`;
  return `${base}/api/report${s}`;
}
