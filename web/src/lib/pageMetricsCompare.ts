import type { CompareMetricRow } from '@/lib/reportCompare';
import type { PageGa4Slice, PageGscSlice } from '@/server/pageGoogleData';

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function deltaRow(
  id: string,
  label: string,
  current: number | null,
  baseline: number | null,
  higherIsBetter: boolean,
  format: CompareMetricRow['format'] = 'count',
): CompareMetricRow {
  const delta =
    current != null && baseline != null ? Math.round((current - baseline) * 10) / 10 : null;
  let deltaPct: number | null = null;
  if (current != null && baseline != null && baseline !== 0) {
    deltaPct = Math.round(((current - baseline) / Math.abs(baseline)) * 1000) / 10;
  }
  return { id, label, current, baseline, delta, higherIsBetter, format, deltaPct };
}

export type PageMetricsPayload = {
  gsc?: PageGscSlice | null;
  ga4?: PageGa4Slice | null;
};

export function buildPageMetricsCompare(
  current: PageMetricsPayload,
  baseline: PageMetricsPayload,
  labels: {
    gscClicks: string;
    gscImpressions: string;
    gscCtr: string;
    gscPosition: string;
    ga4Sessions: string;
    ga4Users: string;
    ga4Views: string;
    ga4Engagement: string;
    ga4Duration: string;
  },
): CompareMetricRow[] {
  const cg = current.gsc;
  const bg = baseline.gsc;
  const ca = current.ga4;
  const ba = baseline.ga4;
  const rows: CompareMetricRow[] = [];

  if (cg || bg) {
    rows.push(
      deltaRow('gsc_clicks', labels.gscClicks, num(cg?.clicks), num(bg?.clicks), true),
      deltaRow('gsc_impr', labels.gscImpressions, num(cg?.impressions), num(bg?.impressions), true),
      deltaRow('gsc_ctr', labels.gscCtr, num(cg?.ctr), num(bg?.ctr), true, 'percent'),
      deltaRow('gsc_pos', labels.gscPosition, num(cg?.position), num(bg?.position), false),
    );
  }
  if (ca || ba) {
    rows.push(
      deltaRow('ga4_sessions', labels.ga4Sessions, num(ca?.sessions), num(ba?.sessions), true),
      deltaRow('ga4_users', labels.ga4Users, num(ca?.activeUsers), num(ba?.activeUsers), true),
      deltaRow(
        'ga4_views',
        labels.ga4Views,
        num(ca?.screenPageViews),
        num(ba?.screenPageViews),
        true,
      ),
      deltaRow(
        'ga4_engagement',
        labels.ga4Engagement,
        num(ca?.engagementRate),
        num(ba?.engagementRate),
        true,
        'percent',
      ),
      deltaRow(
        'ga4_duration',
        labels.ga4Duration,
        num(ca?.avgSessionDuration),
        num(ba?.avgSessionDuration),
        true,
      ),
    );
  }
  return rows.filter((r) => r.current != null || r.baseline != null);
}
