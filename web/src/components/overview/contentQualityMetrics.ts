import type { ContentDuplicateCluster } from '@/types/report';
import { buildViewHref } from './crawlSnapshotMetrics';

export interface LanguageShare {
  lang: string;
  count: number;
  pct: number;
}

export interface ContentConcern {
  id: string;
  label: string;
  href: string;
  severity: number;
}

export function shouldShowContentQuality(data: {
  content_duplicates?: ContentDuplicateCluster[];
  language_summary?: { counts?: Record<string, number> };
  semantic_keyword_clusters?: unknown[];
  ner_site_summary?: { label_counts?: Record<string, number>; total_entities?: number; pages_with_ner?: number };
}): boolean {
  return (
    (data.content_duplicates?.length ?? 0) > 0 ||
    Object.keys(data.language_summary?.counts || {}).length > 0 ||
    (data.semantic_keyword_clusters?.length ?? 0) > 0 ||
    Object.keys(data.ner_site_summary?.label_counts || {}).length > 0 ||
    (data.ner_site_summary?.total_entities ?? 0) > 0
  );
}

export function duplicateMemberCount(cluster: ContentDuplicateCluster): number {
  return cluster.member_count ?? cluster.member_urls?.length ?? 0;
}

export function totalDuplicateMemberPages(clusters: ContentDuplicateCluster[] | undefined): number {
  return (clusters || []).reduce((sum, cluster) => sum + duplicateMemberCount(cluster), 0);
}

export function selectTopDuplicateClusters(
  clusters: ContentDuplicateCluster[] | undefined,
  limit = 2,
): ContentDuplicateCluster[] {
  return [...(clusters || [])]
    .sort((a, b) => duplicateMemberCount(b) - duplicateMemberCount(a))
    .slice(0, limit);
}

export function languageShares(counts: Record<string, number> | undefined, limit = 5): LanguageShare[] {
  const entries = Object.entries(counts || {})
    .map(([lang, count]) => ({ lang, count: Number(count) || 0 }))
    .filter((row) => row.lang && row.count > 0)
    .sort((a, b) => b.count - a.count);
  const total = entries.reduce((sum, row) => sum + row.count, 0) || 1;
  return entries.slice(0, limit).map((row) => ({
    ...row,
    pct: Math.round((row.count / total) * 1000) / 10,
  }));
}

export function languageCount(counts: Record<string, number> | undefined): number {
  return Object.keys(counts || {}).filter((lang) => Number(counts?.[lang] ?? 0) > 0).length;
}

export function duplicateGroupsBand(groupCount: number): 'good' | 'fair' | 'critical' {
  if (groupCount <= 0) return 'good';
  if (groupCount < 5) return 'fair';
  return 'critical';
}

export function stripUrlForDisplay(url: string, maxLen = 72): string {
  return url.replace(/^https?:\/\//, '').slice(0, maxLen);
}

export interface ContentConcernInput {
  duplicateGroups: number;
  duplicatePages: number;
  mixedLanguage: boolean;
  languageCount: number;
  contentHref: string;
  textAnalysisHref: string;
  formatDuplicateGroups: (groups: string, pages: string) => string;
  formatMixedLanguage: (languages: string) => string;
}

export function selectContentConcerns(input: ContentConcernInput, limit = 3): ContentConcern[] {
  const concerns: ContentConcern[] = [];

  if (input.duplicateGroups > 0) {
    concerns.push({
      id: 'duplicates',
      label: input.formatDuplicateGroups(
        input.duplicateGroups.toLocaleString(),
        input.duplicatePages.toLocaleString(),
      ),
      href: input.contentHref,
      severity: 200 + input.duplicateGroups,
    });
  }

  if (input.mixedLanguage) {
    concerns.push({
      id: 'mixed-language',
      label: input.formatMixedLanguage(input.languageCount.toLocaleString()),
      href: input.textAnalysisHref,
      severity: 150 + input.languageCount,
    });
  }

  return concerns.sort((a, b) => b.severity - a.severity).slice(0, limit);
}

export { buildViewHref };
