/**
 * Navigation helpers for cross-view deep links within the report UI.
 */

/**
 * Build a URL for the Link Explorer view with an `inspect` query param,
 * preserving existing search params (e.g. `domain`).
 */
export function buildLinksInspectHref(
  url: string,
  searchParams: URLSearchParams | string | null,
): string {
  const p = new URLSearchParams(searchParams ? searchParams.toString() : '');
  p.set('inspect', url);
  return `/links?${p.toString()}`;
}
