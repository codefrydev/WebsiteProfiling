/** @type {Set<string>} */
const VIEW_IDS = new Set([
  'home',
  'overview',
  'issues',
  'links',
  'site-structure',
  'redirects',
  'content',
  'lighthouse',
  'security',
  'content-analytics',
  'tech-stack',
  'charts',
  'network',
  'gallery',
]);

/**
 * @param {string} viewId
 * @returns {string}
 */
export function viewIdToPathSlug(viewId) {
  if (viewId === 'overview') return 'dashboard';
  return viewId;
}

/**
 * @param {string} slug
 * @returns {string | null} view id, or null if unknown
 */
export function pathSlugToViewId(slug) {
  if (!slug || typeof slug !== 'string') return null;
  if (slug === 'dashboard') return 'overview';
  return VIEW_IDS.has(slug) ? slug : null;
}
