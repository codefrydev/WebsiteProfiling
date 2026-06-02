/**
 * URL prefix when the app is hosted under a subpath (must match next.config `basePath` if set).
 * Empty string = site root (`/`).
 */
export function getPublicBasePath(): string {
  const p = process.env.NEXT_PUBLIC_BASE_PATH;
  if (p == null || p === '' || p === '/') return '';
  return p.endsWith('/') ? p.slice(0, -1) : p;
}

/** Absolute path from origin (e.g. `/assets/foo.png` or `/myapp/assets/foo.png` if basePath is set). */
export function assetUrl(relativePath: string): string {
  const base = getPublicBasePath();
  const pathPart = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  return `${base}${pathPart}`;
}

/** Same-origin generic API path (e.g. `/api/run`). */
export function apiUrl(suffix: string): string {
  const base = getPublicBasePath();
  const s = suffix.startsWith('/') ? suffix : `/${suffix}`;
  return `${base}/api${s}`;
}

/** Report API (server-side PostgreSQL reads). */
export function reportApi(suffix: string): string {
  const base = getPublicBasePath();
  const s = suffix.startsWith('/') ? suffix : `/${suffix}`;
  return `${base}/api/report${s}`;
}
