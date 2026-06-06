export const LINKS_EXPLORER_TABS = ['urls', 'charts'] as const;
export type LinksExplorerTabId = (typeof LINKS_EXPLORER_TABS)[number];

export type LinkSortKey = 'url' | 'status' | 'inlinks' | 'depth' | 'response_time_ms' | 'word_count';

export interface LinksExploreCharts {
  statusLabels: string[];
  statusValues: number[];
  wcLabels: string[];
  wcValues: number[];
}
