import type { OverviewTabId } from '@/components/overview/types';
import type { SectionKey } from '@/lib/reportSections';
import type { ViewId } from '@/routes';

export const OVERVIEW_TAB_SECTIONS: Record<OverviewTabId, readonly SectionKey[]> = {
  summary: ['traffic', 'keywords', 'content', 'indexation', 'tech'],
  charts: ['content', 'lighthouse', 'structure', 'indexation', 'gallery', 'links'],
  health: ['tech'],
  pages: [],
};

/** Per-view sections loaded on mount. Tab-gated views use empty arrays here. */
export const VIEW_SECTIONS: Partial<Record<ViewId, readonly SectionKey[]>> = {
  overview: [],
  issues: ['issues', 'traffic'],
  links: ['links'],
  'site-structure': [],
  redirects: ['issues'],
  content: ['content'],
  lighthouse: ['lighthouse'],
  security: ['security'],
  'javascript-errors': ['links'],
  accessibility: ['links'],
  'image-seo': ['content'],
  'content-analytics': ['content', 'indexation'],
  'text-content-analysis': ['content', 'indexation', 'keywords'],
  'tech-stack': ['tech'],
  network: ['structure', 'links'],
  gallery: ['gallery', 'links'],
  'search-performance': ['traffic'],
  indexation: ['indexation'],
  subdomains: ['tech'],
  contacts: ['tech'],
  backlinks: ['gsc-links', 'keywords'],
  traffic: ['traffic'],
  'keywords-explorer': ['keywords', 'traffic'],
};

export const SITE_STRUCTURE_TAB_SECTIONS: Record<string, readonly SectionKey[]> = {
  overview: ['links'],
  tree: ['structure'],
  map: ['structure'],
  graph: ['structure'],
};

export const TRAFFIC_TAB_SECTIONS: readonly SectionKey[] = ['traffic'];

export const SEARCH_PERFORMANCE_TAB_SECTIONS: readonly SectionKey[] = ['traffic'];

export const LINKS_TAB_SECTIONS: readonly SectionKey[] = ['links'];

export const BACKLINKS_TAB_SECTIONS: readonly SectionKey[] = ['gsc-links', 'keywords'];

export const KEYWORDS_EXPLORER_TAB_SECTIONS: readonly SectionKey[] = ['keywords', 'traffic'];

export type SectionLoadStatus = 'idle' | 'loading' | 'loaded' | 'error';

export function sectionStatusFor(
  sections: readonly SectionKey[],
  statusMap: Partial<Record<SectionKey, SectionLoadStatus>>,
): SectionLoadStatus {
  if (!sections.length) return 'loaded';
  let sawLoading = false;
  for (const key of sections) {
    const s = statusMap[key] ?? 'idle';
    if (s === 'error') return 'error';
    if (s === 'loading' || s === 'idle') sawLoading = true;
  }
  return sawLoading ? 'loading' : 'loaded';
}

export function isSectionPending(
  sections: readonly SectionKey[],
  statusMap: Partial<Record<SectionKey, SectionLoadStatus>>,
): boolean {
  const status = sectionStatusFor(sections, statusMap);
  return status === 'idle' || status === 'loading' || status === 'error';
}
