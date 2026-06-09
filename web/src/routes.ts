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
  | 'javascript-errors'
  | 'content-analytics'
  | 'tech-stack'
  | 'charts'
  | 'network'
  | 'gallery'
  | 'search-performance'
  | 'indexation'
  | 'subdomains'
  | 'contacts'
  | 'backlinks'
  | 'traffic'
  | 'keywords-explorer'
  | 'compare'
  | 'export'
  | 'log-analyzer';

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
  'javascript-errors',
  'content-analytics',
  'tech-stack',
  'charts',
  'network',
  'gallery',
  'search-performance',
  'indexation',
  'subdomains',
  'contacts',
  'backlinks',
  'traffic',
  'keywords-explorer',
  'compare',
  'export',
  'log-analyzer',
]);

export function viewIdToPathSlug(viewId: string): string {
  if (viewId === 'overview') return 'dashboard';
  if (viewId === 'keywords-explorer') return 'keywords';
  return viewId;
}

export function pathSlugToViewId(slug: string | null | undefined): ViewId | null {
  if (!slug || typeof slug !== 'string') return null;
  if (slug === 'dashboard') return 'overview';
  if (slug === 'keywords') return 'keywords-explorer';
  return VIEW_IDS.has(slug) ? (slug as ViewId) : null;
}
