import type { ReportCategory } from '@/types';
import type { GscDailyRow } from '@/types/components';
import type { CompactDonutSegment } from '@/components/charts/compact';

export interface IssuePriorityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  total: number;
}

export interface LighthouseHighlight {
  id: string;
  score: number | null;
}

const ISSUE_MIX_COLORS = {
  high: 'rgb(251 191 36 / 0.9)',
  medium: 'rgb(59 130 246 / 0.75)',
  low: 'rgb(100 116 139 / 0.55)',
} as const;

const LH_HIGHLIGHT_ORDER = ['performance', 'seo', 'accessibility'] as const;

export function countIssuesByPriority(categories: ReportCategory[] | null | undefined): IssuePriorityCounts {
  const counts: IssuePriorityCounts = { critical: 0, high: 0, medium: 0, low: 0, total: 0 };
  for (const cat of categories || []) {
    for (const iss of cat?.issues || []) {
      counts.total += 1;
      const p = String(iss?.priority || '');
      if (p === 'Critical') counts.critical += 1;
      else if (p === 'High') counts.high += 1;
      else if (p === 'Medium') counts.medium += 1;
      else counts.low += 1;
    }
  }
  return counts;
}

/** Build donut segments for High / Medium / Low issue mix (excludes Critical). */
export function buildIssueMixSegments(counts: IssuePriorityCounts): CompactDonutSegment[] {
  const segments: CompactDonutSegment[] = [];
  if (counts.high > 0) {
    segments.push({ label: 'High', value: counts.high, color: ISSUE_MIX_COLORS.high });
  }
  if (counts.medium > 0) {
    segments.push({ label: 'Medium', value: counts.medium, color: ISSUE_MIX_COLORS.medium });
  }
  if (counts.low > 0) {
    segments.push({ label: 'Low', value: counts.low, color: ISSUE_MIX_COLORS.low });
  }
  return segments;
}

/** Map GSC daily clicks to normalized bar heights (0–100). Returns null if fewer than 2 days. */
export function buildGscBarHeights(
  daily: GscDailyRow[] | null | undefined,
  maxBars = 12,
): number[] | null {
  if (!daily?.length || daily.length < 2) return null;

  const slice = daily.slice(-maxBars);
  const clicks = slice.map((row) => Number(row.clicks ?? 0));
  const max = Math.max(...clicks);
  if (max <= 0) return null;

  return clicks.map((c) => Math.round((c / max) * 100));
}

/** Extract click values for sparkline from GSC daily rows. */
export function buildGscSparklinePoints(
  daily: GscDailyRow[] | null | undefined,
  maxPoints = 14,
): number[] | null {
  if (!daily?.length || daily.length < 2) return null;
  const clicks = daily.slice(-maxPoints).map((row) => Number(row.clicks ?? 0));
  if (clicks.every((c) => c === 0)) return null;
  return clicks;
}

export function pickLighthouseHighlights(
  scores: Record<string, number | null | undefined> | null | undefined,
): LighthouseHighlight[] {
  if (!scores || typeof scores !== 'object') return [];

  return LH_HIGHLIGHT_ORDER.map((id) => {
    const raw = scores[id];
    const num = raw != null && Number.isFinite(Number(raw)) ? Number(raw) : null;
    return { id, score: num };
  }).filter((h) => h.score != null);
}

export interface ShouldShowAtAGlanceInput {
  urlCount?: number;
  issueCounts?: IssuePriorityCounts;
  gscDaily?: GscDailyRow[] | null;
  lighthouseScores?: Record<string, number | null | undefined> | null;
}

export function shouldShowAtAGlance({
  urlCount = 0,
  issueCounts,
  gscDaily,
  lighthouseScores,
}: ShouldShowAtAGlanceInput): boolean {
  if (urlCount > 0) return true;
  if (issueCounts && issueCounts.total > 0) return true;
  if (buildGscBarHeights(gscDaily) != null) return true;
  if (buildGscSparklinePoints(gscDaily) != null) return true;
  if (pickLighthouseHighlights(lighthouseScores).length > 0) return true;
  return false;
}
