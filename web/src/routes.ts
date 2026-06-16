/** Internal view ids used by components and navigation. */
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
  | 'accessibility'
  | 'image-seo'
  | 'geo-readiness'
  | 'content-analytics'
  | 'text-content-analysis'
  | 'tech-stack'
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

/** Canonical URL path segments under `/` (validated by `[slug]/page.tsx`). */
export const REPORT_PATH_SLUGS = [
  'home',
  'dashboard',
  'keywords',
  'issues',
  'links',
  'site-structure',
  'redirects',
  'content',
  'lighthouse',
  'security',
  'javascript-errors',
  'accessibility',
  'image-seo',
  'geo-readiness',
  'content-analytics',
  'text-content-analysis',
  'tech-stack',
  'network',
  'gallery',
  'search-performance',
  'indexation',
  'subdomains',
  'contacts',
  'backlinks',
  'traffic',
  'compare',
  'export',
  'log-analyzer',
] as const;

export type ReportPathSlug = (typeof REPORT_PATH_SLUGS)[number];

const REPORT_PATH_SLUG_SET = new Set<string>(REPORT_PATH_SLUGS);

export function viewIdToPathSlug(viewId: string): string {
  if (viewId === 'overview') return 'dashboard';
  if (viewId === 'keywords-explorer') return 'keywords';
  return viewId;
}

export function pathSlugToViewId(slug: string | null | undefined): ViewId | null {
  if (!slug || typeof slug !== 'string') return null;
  if (slug === 'dashboard') return 'overview';
  if (slug === 'keywords') return 'keywords-explorer';
  return REPORT_PATH_SLUG_SET.has(slug) ? (slug as ViewId) : null;
}
