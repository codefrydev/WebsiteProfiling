/**
 * GA4-specific helpers for Traffic & Engagement.
 */

import type { ExportColumn, Ga4PageRow } from '@/types/components';

export const MIN_SESSIONS_OPPORTUNITY = 50;
export const MAX_ENGAGEMENT_RATE = 0.5;

export function filterLowEngagement(pages: Ga4PageRow[]): Ga4PageRow[] {
  if (!pages?.length) return [];
  return pages.filter(
    (p) => (p.sessions || 0) >= MIN_SESSIONS_OPPORTUNITY && (p.engagementRate ?? 1) < MAX_ENGAGEMENT_RATE,
  );
}

/** Count pages per engagement-rate bucket (0–25%, 25–50%, 50–75%, 75–100%). */
export function buildEngagementBuckets(pages: Ga4PageRow[] | null | undefined): number[] {
  const buckets = [0, 0, 0, 0];
  for (const p of pages || []) {
    const rate = parseFloat(String(p.engagementRate));
    if (rate == null || Number.isNaN(rate)) continue;
    const pct = rate <= 1 ? rate * 100 : rate;
    if (pct < 25) buckets[0] += 1;
    else if (pct < 50) buckets[1] += 1;
    else if (pct < 75) buckets[2] += 1;
    else buckets[3] += 1;
  }
  return buckets;
}

export function formatEngagementPercent(rate: number | null | undefined): string | null {
  if (rate == null) return null;
  const pct = rate <= 1 ? rate * 100 : rate;
  return `${pct.toFixed(1)}%`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || seconds <= 0) return '—';
  const s = Math.round(Number(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m === 0) return `${rem}s`;
  return `${m}m ${rem}s`;
}

export function buildPageExportColumns(tf: { table: Record<string, string> }): ExportColumn[] {
  return [
    { key: 'path', label: tf.table.path },
    { key: 'sessions', label: tf.table.sessions },
    { key: 'activeUsers', label: tf.table.users },
    { key: 'screenPageViews', label: tf.table.pageViews },
    { key: 'engagementRate', label: tf.table.engagement },
    { key: 'avgSessionDuration', label: tf.table.avgDuration },
  ];
}
