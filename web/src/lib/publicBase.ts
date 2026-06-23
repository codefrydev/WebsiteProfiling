/**
 * URL prefix when the app is hosted under a subpath (must match next.config `basePath` if set).
 * Empty string = site root (`/`).
 */
export function getPublicBasePath(): string {
  const p = process.env.NEXT_PUBLIC_BASE_PATH;
  if (p == null || p === '' || p === '/') return '';
  return p.endsWith('/') ? p.slice(0, -1) : p;
}

/**
 * Absolute origin of the .NET BFF (the single browser-facing API surface).
 * Set NEXT_PUBLIC_BFF_BASE_URL to e.g. `http://localhost:8090` to route /api/* cross-origin
 * to the BFF. Empty (the default) keeps requests same-origin under `/api`, which is the
 * rollback path — flipping/unsetting this env var is the cutover switch.
 */
export function bffBaseUrl(): string {
  const b = process.env.NEXT_PUBLIC_BFF_BASE_URL;
  if (b == null || b === '') return '';
  return b.endsWith('/') ? b.slice(0, -1) : b;
}

/** Absolute path from origin (e.g. `/assets/foo.png` or `/myapp/assets/foo.png` if basePath is set). */
export function assetUrl(relativePath: string): string {
  const base = getPublicBasePath();
  const pathPart = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  return `${base}${pathPart}`;
}

/** Generic API URL, targeting the BFF when NEXT_PUBLIC_BFF_BASE_URL is set (else same-origin). */
export function apiUrl(suffix: string): string {
  const base = getPublicBasePath();
  const s = suffix.startsWith('/') ? suffix : `/${suffix}`;
  return `${bffBaseUrl()}${base}/api${s}`;
}

/** Report API URL, targeting the BFF when NEXT_PUBLIC_BFF_BASE_URL is set (else same-origin). */
export function reportApi(suffix: string): string {
  const base = getPublicBasePath();
  const s = suffix.startsWith('/') ? suffix : `/${suffix}`;
  return `${bffBaseUrl()}${base}/api/report${s}`;
}

/**
 * Credentialed fetch for BFF calls. Cross-origin requests do NOT send the wp_session cookie
 * unless `credentials: 'include'` is set on every call — so all /api requests built via
 * apiUrl()/reportApi() must go through this wrapper. Same-origin (default) is unaffected.
 */
export function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  // Already-absolute URLs (e.g. built by apiUrl/reportApi when the BFF base is set) pass through;
  // relative '/api/...' paths get the BFF base prefixed here so hardcoded literals also reach the BFF.
  const url = /^https?:\/\//.test(input) ? input : `${bffBaseUrl()}${input}`;
  return fetch(url, { credentials: 'include', ...init });
}
