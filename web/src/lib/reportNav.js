/**
 * Navigation helpers for cross-view deep links within the report UI.
 */

/**
 * Build a URL for the Link Explorer view with an `inspect` query param,
 * preserving existing search params (e.g. `domain`).
 *
 * @param {string} url - The URL to inspect
 * @param {URLSearchParams|string|null} searchParams - Existing search params to preserve
 * @returns {string} Relative href like `/links?domain=...&inspect=...`
 */
export function buildLinksInspectHref(url, searchParams) {
  const p = new URLSearchParams(searchParams ? searchParams.toString() : '');
  p.set('inspect', url);
  return `/links?${p.toString()}`;
}
