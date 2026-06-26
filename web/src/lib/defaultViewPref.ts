import type { ViewId } from '@/routes';
import { getCachedClientPreferences, patchClientPreferences } from '@/lib/clientPreferences';

const DEFAULT_VIEW_LS_KEY = 'wp-default-view:v1';

/** Views that make sense as a landing target after selecting a site. */
export const LANDING_VIEW_OPTIONS: { id: ViewId; label: string; description: string }[] = [
  { id: 'overview', label: 'Overview', description: 'Audit summary with scores and key metrics' },
  { id: 'dashboards', label: 'Dashboards', description: 'Custom widget dashboards' },
  { id: 'issues', label: 'Issues', description: 'Prioritised list of all detected issues' },
  { id: 'links', label: 'Links', description: 'Full crawl link inventory' },
  { id: 'content', label: 'Content', description: 'Page content and metadata analysis' },
  { id: 'lighthouse', label: 'Lighthouse', description: 'Performance, accessibility and SEO scores' },
  { id: 'search-performance', label: 'Search performance', description: 'Google Search Console data' },
];

export const DEFAULT_LANDING_VIEW: ViewId = 'overview';

export function getDefaultLandingView(): ViewId {
  return getCachedClientPreferences().defaultLandingView;
}

export function setDefaultLandingView(view: ViewId): void {
  try {
    localStorage.setItem(DEFAULT_VIEW_LS_KEY, view);
  } catch {
    /* ignore */
  }
  patchClientPreferences({ defaultLandingView: view });
}
