/**
 * URL normalization for matching crawl / GSC / GA4 (mirrors Python normalize_url).
 */
export function normalizeUrl(url: string): string {
  const raw = (url || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const path = u.pathname.replace(/\/$/, '') || '/';
    return `${host}${path}`;
  } catch {
    return raw.toLowerCase().replace(/\/$/, '');
  }
}

export function urlToPath(url: string): string {
  try {
    return new URL(url).pathname || '/';
  } catch {
    return url;
  }
}
