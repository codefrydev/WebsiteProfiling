/** Known report view ids (path segments under `/`). */
export type ViewId =
  | 'home'
  | 'overview'
  | 'issues'
  | 'links'
  | 'site-structure'
  | 'redirects'
  | 'content'
  | 'lighthouse'
  | 'security'
  | 'content-analytics'
  | 'tech-stack'
  | 'charts'
  | 'network'
  | 'gallery'
  | 'search-performance'
  | 'traffic'
  | 'keywords-explorer'
  | 'compare';

const VIEW_IDS = new Set<string>([
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
  'search-performance',
  'traffic',
  'keywords-explorer',
  'compare',
]);

export function viewIdToPathSlug(viewId: string): string {
  if (viewId === 'overview') return 'dashboard';
  return viewId;
}

export function pathSlugToViewId(slug: string | null | undefined): ViewId | null {
  if (!slug || typeof slug !== 'string') return null;
  if (slug === 'dashboard') return 'overview';
  return VIEW_IDS.has(slug) ? (slug as ViewId) : null;
}
