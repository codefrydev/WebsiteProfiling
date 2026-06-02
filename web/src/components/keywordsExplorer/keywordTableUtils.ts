import { formatGscCtr } from '../../lib/gscMetrics';
import type { ExportColumn, KeywordIntent, KeywordRow } from '@/types/components';

export const INTENT_COLORS: Record<string, string> = {
  informational: 'bg-blue-500/20 text-blue-700 dark:text-blue-300',
  commercial: 'bg-purple-500/20 text-purple-700 dark:text-purple-300',
  transactional: 'bg-green-500/20 text-green-700 dark:text-green-300',
  navigational: 'bg-orange-500/20 text-orange-700 dark:text-orange-300',
};

export const SOURCE_CONFIG: Record<string, { label: string; color: string }> = {
  site: { label: 'site', color: 'bg-sky-500/20 text-sky-700 dark:text-sky-300' },
  gsc: { label: 'GSC', color: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300' },
  suggest: { label: 'suggest', color: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-300' },
  youtube: { label: 'youtube', color: 'bg-red-500/20 text-red-700 dark:text-red-300' },
  questions: { label: 'Q&A', color: 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-300' },
  datamuse: { label: 'semantic', color: 'bg-pink-500/20 text-pink-700 dark:text-pink-300' },
  wiki: { label: 'wiki', color: 'bg-gray-500/20 text-gray-700 dark:text-gray-300' },
};

export type IntentCounts = Record<KeywordIntent, number>;

export function difficultyColor(kd: number): string {
  if (kd <= 30) return 'text-green-700 dark:text-green-400';
  if (kd <= 55) return 'text-yellow-700 dark:text-yellow-400';
  if (kd <= 75) return 'text-orange-700 dark:text-orange-400';
  return 'text-red-700 dark:text-red-400';
}

export function buildIntentCounts(rows: KeywordRow[]): IntentCounts {
  const counts: IntentCounts = {
    informational: 0,
    commercial: 0,
    transactional: 0,
    navigational: 0,
    other: 0,
  };
  for (const r of rows) {
    const intent = (r.intent || 'other') as KeywordIntent;
    if (intent in counts && intent !== 'other') counts[intent] += 1;
    else counts.other += 1;
  }
  return counts;
}

export function buildSourceCounts(rows: KeywordRow[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of rows) {
    for (const s of r.sources || []) {
      counts[s] = (counts[s] || 0) + 1;
    }
  }
  return counts;
}

export function exportKeywordCsv(rows: KeywordRow[]): void {
  if (!rows?.length) return;
  const cols = [
    'keyword', 'intent', 'is_branded', 'is_question', 'difficulty',
    'gsc_position', 'gsc_impressions', 'gsc_clicks', 'gsc_ctr',
    'traffic_potential', 'opportunity_clicks', 'parent_topic', 'trend',
    'sources', 'gsc_url', 'recommended_action',
  ];
  const escape = (v: unknown): string => {
    if (v == null) return '';
    const s = Array.isArray(v) ? v.join('|') : String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    cols.join(','),
    ...rows.map((r) =>
      cols
        .map((c) => {
          if (c === 'gsc_ctr' && r[c] != null) return escape(formatGscCtr(r[c] as number));
          return escape(r[c]);
        })
        .join(','),
    ),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'keywords_explorer.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function buildExportColumns(ke: { table: Record<string, string> }): ExportColumn[] {
  return [
    { key: 'keyword', label: ke.table.keyword },
    { key: 'intent', label: ke.table.intent },
    { key: 'gsc_position', label: ke.table.position },
    { key: 'gsc_impressions', label: ke.table.impressions },
    { key: 'gsc_clicks', label: ke.table.clicks },
    { key: 'gsc_ctr', label: ke.table.ctr },
    { key: 'opportunity_clicks', label: ke.table.opportunityClicks },
    { key: 'recommended_action', label: ke.table.action },
  ];
}

/** e.g. https://example.com -> example */
export function deriveBrandFromUrl(url: string | null | undefined): string {
  if (!url) return '';
  try {
    const href = String(url).trim().startsWith('http') ? url : `https://${url}`;
    const host = new URL(href).hostname.toLowerCase().replace(/^www\./, '');
    const label = host.split('.')[0];
    return label && label.length >= 3 ? label : '';
  } catch {
    return '';
  }
}

export function isKeywordBrandRelevant(row: KeywordRow, brandName: string): boolean {
  if (!brandName) return true;
  if (row.is_branded) return true;
  const kw = String(row.keyword || '').toLowerCase();
  const words = brandName.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  if (words.some((w) => kw.includes(w))) return true;
  const stem = brandName.toLowerCase().replace(/[\s-]+/g, '');
  if (stem.length >= 4 && kw.replace(/[\s-]+/g, '').includes(stem)) return true;
  return false;
}

const EXPANSION_SOURCES = ['suggest', 'youtube', 'questions', 'datamuse'];

export function filterRowsByTab(
  rows: KeywordRow[],
  tabId: string,
  options: { brandName?: string; brandScoped?: boolean } = {},
): KeywordRow[] {
  const { brandName = '', brandScoped = true } = options;
  const applyBrandScope = brandScoped && brandName;

  switch (tabId) {
    case 'questions':
      return rows.filter(
        (r) => r.is_question && (!applyBrandScope || isKeywordBrandRelevant(r, brandName)),
      );
    case 'quickwins':
      return rows.filter((r) => {
        const pos = parseFloat(String(r.gsc_position || 0));
        return pos >= 4 && pos <= 20 && (r.opportunity_clicks || 0) > 5;
      });
    case 'lostclicks':
      return rows.filter((r) => r.lost_clicks);
    case 'opportunities':
      return rows.filter((r) => {
        if (r.gsc_position) return false;
        if (!(r.sources || []).some((s) => EXPANSION_SOURCES.includes(s))) return false;
        return !applyBrandScope || isKeywordBrandRelevant(r, brandName);
      });
    default:
      return rows;
  }
}
