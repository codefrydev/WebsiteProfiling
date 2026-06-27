/**
 * URL prefix when the app is hosted under a subpath.
 * Empty string = site root (`/`).
 */
export function getPublicBasePath(): string {
  const p = import.meta.env.VITE_BASE_PATH;
  if (p == null || p === '' || p === '/') return '';
  return p.endsWith('/') ? p.slice(0, -1) : p;
}

/**
 * Absolute origin of the .NET BFF — the single backend the browser is allowed to talk to.
 * Set VITE_BFF_BASE_URL to the BFF origin (prod must set it); falls back to the local BFF port for dev.
 */
export function bffBaseUrl(): string {
  const b = import.meta.env.VITE_BFF_BASE_URL;
  if (b != null && b !== '') {
    return b.endsWith('/') ? b.slice(0, -1) : b;
  }
  return 'http://localhost:8090';
}

/** Absolute path from origin (e.g. `/assets/foo.png` or `/myapp/assets/foo.png` if basePath is set). */
export function assetUrl(relativePath: string): string {
  const base = getPublicBasePath();
  const pathPart = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  return `${base}${pathPart}`;
}

/** Generic API URL targeting the BFF. */
export function apiUrl(suffix: string): string {
  const base = getPublicBasePath();
  const s = suffix.startsWith('/') ? suffix : `/${suffix}`;
  return `${bffBaseUrl()}${base}/api${s}`;
}

/** Report API URL targeting the BFF. */
export function reportApi(suffix: string): string {
  const base = getPublicBasePath();
  const s = suffix.startsWith('/') ? suffix : `/${suffix}`;
  return `${bffBaseUrl()}${base}/api/report${s}`;
}

/**
 * Credentialed fetch for BFF calls. Cross-origin requests do NOT send the wp_session cookie
 * unless `credentials: 'include'` is set on every call.
 */
export function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const url = /^https?:\/\//.test(input) ? input : `${bffBaseUrl()}${input}`;
  return fetch(url, { credentials: 'include', ...init });
}

/** Parse FastAPI `{ detail }` or legacy `{ error }` JSON error bodies from failed BFF responses. */
export function readApiErrorMessage(
  data: unknown,
  res: Response,
  fallback = 'Request failed',
): string {
  const body =
    data !== null && typeof data === 'object'
      ? (data as { detail?: unknown; error?: unknown })
      : null;
  const detail = body?.detail;
  if (typeof detail === 'string' && detail.trim()) {
    return detail;
  }
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'msg' in item) {
          return String((item as { msg?: unknown }).msg ?? '');
        }
        return String(item);
      })
      .filter(Boolean);
    if (parts.length > 0) return parts.join(' ');
  }
  if (typeof body?.error === 'string' && body.error.trim()) {
    return body.error;
  }
  return res.statusText || fallback;
}
