import type { CompareMetricRow } from './reportCompare';
import type { PriorityCountRow } from './reportCompareExtras';
import type { ReportPayload } from '@/types/report';

export interface DualSeriesChartData {
  labels: string[];
  baseline: (number | null)[];
  current: (number | null)[];
}

function shortDate(iso: string | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return String(iso);
  }
}

/** Align two daily series by index (day 1…N) for overlaid line charts. */
export function buildAlignedDailySeries(
  baselineRows: Array<Record<string, unknown>>,
  currentRows: Array<Record<string, unknown>>,
  valueKey: string,
): DualSeriesChartData {
  const len = Math.max(baselineRows.length, currentRows.length);
  const labels: string[] = [];
  const baseline: (number | null)[] = [];
  const current: (number | null)[] = [];

  for (let i = 0; i < len; i++) {
    const br = baselineRows[i];
    const cr = currentRows[i];
    const bd = br?.date != null ? String(br.date) : '';
    const cd = cr?.date != null ? String(cr.date) : '';
    if (bd && cd) labels.push(`${shortDate(bd)} · ${shortDate(cd)}`);
    else labels.push(shortDate(bd || cd) || `D${i + 1}`);

    const bv = br?.[valueKey];
    const cv = cr?.[valueKey];
    baseline.push(bv != null && bv !== '' ? Number(bv) : null);
    current.push(cv != null && cv !== '' ? Number(cv) : null);
  }

  return { labels, baseline, current };
}

const STATUS_KEYS = [
  { id: '2xx', label: '2xx', pick: (p: ReportPayload) => Number(p.summary?.count_2xx ?? 0) },
  { id: '3xx', label: '3xx', pick: (p: ReportPayload) => Number(p.summary?.count_3xx ?? 0) },
  { id: '4xx', label: '4xx', pick: (p: ReportPayload) => Number(p.summary?.count_4xx ?? 0) },
  { id: '5xx', label: '5xx', pick: (p: ReportPayload) => Number(p.summary?.count_5xx ?? 0) },
];

export function buildStatusDistributionChart(
  current: ReportPayload,
  baseline: ReportPayload,
): DualSeriesChartData {
  return {
    labels: STATUS_KEYS.map((k) => k.label),
    baseline: STATUS_KEYS.map((k) => k.pick(baseline)),
    current: STATUS_KEYS.map((k) => k.pick(current)),
  };
}

export function buildPriorityChart(rows: PriorityCountRow[]): DualSeriesChartData {
  return {
    labels: rows.map((r) => r.priority),
    baseline: rows.map((r) => r.baseline),
    current: rows.map((r) => r.current),
  };
}

/** Pick site-wide metrics suitable for a grouped bar chart. */
export function pickMetricsForChart(metrics: CompareMetricRow[], max = 8): CompareMetricRow[] {
  const skip = new Set(['success_rate']);
  return metrics
    .filter((m) => !skip.has(m.id) && (m.current != null || m.baseline != null))
    .slice(0, max);
}

export function buildMetricsBarChart(rows: CompareMetricRow[]): DualSeriesChartData {
  return {
    labels: rows.map((r) => r.label),
    baseline: rows.map((r) => r.baseline),
    current: rows.map((r) => r.current),
  };
}

export function hasGoogleDaily(current: ReportPayload, baseline: ReportPayload): {
  gsc: boolean;
  ga4: boolean;
} {
  const gsc =
    (baseline.google?.gsc?.daily?.length ?? 0) > 0 && (current.google?.gsc?.daily?.length ?? 0) > 0;
  const ga4 =
    (baseline.google?.ga4?.daily?.length ?? 0) > 0 && (current.google?.ga4?.daily?.length ?? 0) > 0;
  return { gsc, ga4 };
}
