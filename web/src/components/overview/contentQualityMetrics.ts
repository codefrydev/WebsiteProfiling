import type { CompactDonutSegment } from '@/components/charts/compact';
import type { ContentDuplicateCluster } from '@/types/report';
import { palette } from '@/utils/chartPalette';
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

const PALETTE_FALLBACK = '#4C72B0';

/** Donut segments for top sampled languages (page counts). */
export function buildLanguageMixSegments(
  counts: Record<string, number> | undefined,
  limit = 5,
): CompactDonutSegment[] {
  const shares = languageShares(counts, limit);
  const colors = palette(shares.length);
  return shares.map((row, i) => ({
    label: row.lang,
    value: row.count,
    color: colors[i] ?? PALETTE_FALLBACK,
  }));
}

export interface LanguageBarChartDatum {
  label: string;
  height: number;
  color: string;
}

/** Sqrt-scaled bar heights so minor locales stay visible; null if fewer than 2 locales. */
export function buildLanguageBarChartData(
  counts: Record<string, number> | undefined,
  limit = 6,
): LanguageBarChartDatum[] | null {
  const shares = languageShares(counts, limit);
  if (shares.length < 2) return null;
  const max = Math.max(...shares.map((s) => s.count));
  if (max <= 0) return null;
  const sqrtMax = Math.sqrt(max);
  const colors = palette(shares.length);
  const MIN_HEIGHT = 22;

  return shares.map((row, i) => {
    const scaled = (Math.sqrt(row.count) / sqrtMax) * 100;
    return {
      label: row.lang,
      height: Math.round(Math.max(MIN_HEIGHT, scaled)),
      color: colors[i] ?? PALETTE_FALLBACK,
    };
  });
}

/** @deprecated Use buildLanguageBarChartData for labeled chubby charts */
export function buildLanguageBarHeights(
  counts: Record<string, number> | undefined,
  limit = 8,
): number[] | null {
  const data = buildLanguageBarChartData(counts, limit);
  return data?.map((row) => row.height) ?? null;
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
