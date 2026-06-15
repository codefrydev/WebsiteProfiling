import type { KeywordRow } from '@/types/components';
import type { KeywordOpportunityItem, TopicCluster } from '@/types/report';
import { isJunkSemanticTerm } from '@/lib/semanticTextHygiene';

/** Max keyword rows shown on Overview summary preview. */
export const KEYWORD_PREVIEW_LIMIT = 5;


function filterCrawlItems(items: KeywordOpportunityItem[] | undefined): KeywordOpportunityItem[] {
  return (items ?? []).filter((item) => !isJunkSemanticTerm(item.keyword));
}

function filterTopicClusters(clusters: TopicCluster[] | undefined): TopicCluster[] {
  return (clusters ?? []).filter((cl) => {
    const label = String(cl.top_keyword ?? cl.representative ?? '');
    return label.length > 0 && !isJunkSemanticTerm(label);
  });
}

export interface SiteTopKeyword {
  keyword: string;
  count: number;
}

export function selectSiteTopKeywords(
  items: Array<{ word?: string; count?: number }> | undefined,
  limit = 8,
): SiteTopKeyword[] {
  return (items ?? [])
    .map((item) => ({
      keyword: String(item.word ?? '').trim(),
      count: Number(item.count ?? 0),
    }))
    .filter((item) => item.keyword.length >= 3 && !isJunkSemanticTerm(item.keyword) && item.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function selectGscQuickWins(rows: KeywordRow[], limit = 8): KeywordRow[] {
  return [...rows]
    .filter((r) => {
      if (r.gsc_position == null) return false;
      const pos = parseFloat(String(r.gsc_position));
      return pos >= 4 && pos <= 20 && (r.opportunity_clicks || 0) > 5;
    })
    .sort((a, b) => (b.opportunity_clicks || 0) - (a.opportunity_clicks || 0))
    .slice(0, limit);
}

export function selectGscOpportunities(rows: KeywordRow[], limit = 8): KeywordRow[] {
  return [...rows]
    .filter((r) => r.gsc_position == null && (r.sources || []).length > 0)
    .sort((a, b) => (b.traffic_potential || 0) - (a.traffic_potential || 0))
    .slice(0, limit);
}

export function selectCrawlQuickWins(items: KeywordOpportunityItem[] | undefined, limit = 8): KeywordOpportunityItem[] {
  const filtered = filterCrawlItems(items);
  if (!filtered.length) return [];
  return [...filtered]
    .sort((a, b) => (b.sources_count ?? 0) - (a.sources_count ?? 0) || (b.relevance ?? 0) - (a.relevance ?? 0))
    .slice(0, limit);
}

export function selectCrawlHighEmphasis(items: KeywordOpportunityItem[] | undefined, limit = 8): KeywordOpportunityItem[] {
  const filtered = filterCrawlItems(items);
  if (!filtered.length) return [];
  return [...filtered]
    .sort((a, b) => (b.sources_count ?? 0) - (a.sources_count ?? 0) || (b.volume ?? 0) - (a.volume ?? 0))
    .slice(0, limit);
}

export function selectTopTopicClusters(clusters: TopicCluster[] | undefined, limit = 5): TopicCluster[] {
  const filtered = filterTopicClusters(clusters);
  if (!filtered.length) return [];
  return [...filtered]
    .sort((a, b) => Number(b.cluster_score ?? 0) - Number(a.cluster_score ?? 0))
    .slice(0, limit);
}

export function formatGscQuickWinSuffix(row: KeywordRow): string {
  const clicks = row.opportunity_clicks || 0;
  const pos = row.gsc_position != null ? Number(row.gsc_position).toFixed(1) : null;
  const clicksSuffix = clicks > 0 ? `+${clicks.toLocaleString()} est. clicks` : '';
  if (pos != null) return clicksSuffix ? `${clicksSuffix} · pos ${pos}` : `pos ${pos}`;
  return clicksSuffix;
}

export function formatGscOpportunitySuffix(row: KeywordRow): string {
  const impr = row.gsc_impressions || 0;
  if (impr > 0) return `${impr.toLocaleString()} impr.`;
  const potential = row.traffic_potential || 0;
  if (potential > 0) return `potential ${Math.round(potential).toLocaleString()}`;
  return '';
}

export function formatCrawlActionLabel(
  action: string | undefined,
  labels: Record<string, string>,
): string {
  if (!action) return '';
  return labels[action] ?? action;
}

export function formatCrawlPagesSuffix(item: KeywordOpportunityItem, onPagesLabel: (n: number) => string): string {
  const count = item.sources_count;
  if (count != null && count > 0) return onPagesLabel(count);
  if (item.volume != null && item.volume > 0) return `${Math.round(item.volume * 100)}% site freq.`;
  return '';
}

export function sumGscQuickWinClicks(rows: KeywordRow[]): number {
  return selectGscQuickWins(rows, 200).reduce((total, row) => total + (row.opportunity_clicks || 0), 0);
}

export function buildKeywordsTabHref(keywordsHref: string, tab: string): string {
  const joiner = keywordsHref.includes('?') ? '&' : '?';
  return `${keywordsHref}${joiner}tab=${encodeURIComponent(tab)}`;
}
