import type { KeywordRow } from '@/types/components';
import { filterRowsByTab } from './keywordTableUtils';

export const KEYWORD_TABLE_TAB_IDS = [
  'all',
  'questions',
  'quickwins',
  'striking',
  'lostclicks',
  'opportunities',
] as const;

export type KeywordTableTabId = (typeof KEYWORD_TABLE_TAB_IDS)[number];

export type KeywordTabId =
  | 'overview'
  | KeywordTableTabId
  | 'cannib'
  | 'alignment'
  | 'bypage';

export function isTableTab(tab: KeywordTabId): tab is KeywordTableTabId {
  return (KEYWORD_TABLE_TAB_IDS as readonly string[]).includes(tab);
}

export function tabRowCount(
  tab: KeywordTabId,
  rows: KeywordRow[],
  options: { brandName: string; brandScoped: boolean },
  counts: {
    questions: number;
    quickwins: number;
    striking: number;
    lostclicks: number;
    opportunities: number;
    cannib: number;
    alignment: number;
    pages: number;
  },
): number | null {
  switch (tab) {
    case 'overview':
      return null;
    case 'all':
      return rows.length;
    case 'questions':
      return counts.questions || null;
    case 'quickwins':
      return counts.quickwins || null;
    case 'striking':
      return counts.striking || null;
    case 'lostclicks':
      return counts.lostclicks || null;
    case 'opportunities':
      return counts.opportunities || null;
    case 'cannib':
      return counts.cannib || null;
    case 'alignment':
      return counts.alignment || null;
    case 'bypage':
      return counts.pages || null;
    default:
      return null;
  }
}

export function defaultSortForTab(tab: KeywordTableTabId): string {
  switch (tab) {
    case 'quickwins':
      return 'opportunity_clicks';
    case 'striking':
      return 'gsc_impressions';
    case 'lostclicks':
      return 'lost_clicks';
    case 'questions':
      return 'gsc_impressions';
    case 'opportunities':
      return 'traffic_potential';
    default:
      return 'traffic_potential';
  }
}

export function baseRowsForTab(
  tab: KeywordTableTabId,
  rows: KeywordRow[],
  options: { brandName: string; brandScoped: boolean },
): KeywordRow[] {
  if (tab === 'all') return rows;
  return filterRowsByTab(rows, tab, options);
}
