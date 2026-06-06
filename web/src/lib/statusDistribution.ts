import { CHART_GUIDELINES } from '@/lib/chartGuidelines';
import { filterZeroSlices, formatCompositionAria } from '@/lib/chartDoughnutUtils';

export const STATUS_GROUP_LABELS = {
  ok2xx: '2xx OK',
  redirect3xx: '3xx Redirect',
  client4xx: '4xx Client error',
  server5xx: '5xx Server error',
  error: 'Error / blocked',
} as const;

export type StatusDistributionMode = 'doughnut' | 'bar';

export interface StatusDistribution {
  mode: StatusDistributionMode;
  labels: string[];
  values: number[];
  aria: string;
  total: number;
}

function classifyStatusCode(code: string): keyof typeof STATUS_GROUP_LABELS | null {
  const n = parseInt(code, 10);
  if (Number.isNaN(n)) return 'error';
  if (n >= 200 && n < 300) return 'ok2xx';
  if (n >= 300 && n < 400) return 'redirect3xx';
  if (n >= 400 && n < 500) return 'client4xx';
  if (n >= 500 && n < 600) return 'server5xx';
  return 'error';
}

const GROUP_ORDER: (keyof typeof STATUS_GROUP_LABELS)[] = [
  'ok2xx',
  'redirect3xx',
  'client4xx',
  'server5xx',
  'error',
];

function buildFromBuckets(buckets: Record<keyof typeof STATUS_GROUP_LABELS, number>): StatusDistribution | null {
  const labels = GROUP_ORDER.map((k) => STATUS_GROUP_LABELS[k]);
  const values = GROUP_ORDER.map((k) => buckets[k] ?? 0);
  const filtered = filterZeroSlices(labels, values);
  if (filtered.values.length === 0) return null;

  const total = filtered.values.reduce((a, b) => a + b, 0);
  const mode: StatusDistributionMode =
    filtered.labels.length <= CHART_GUIDELINES.DOUGHNUT_MAX_SLICES ? 'doughnut' : 'bar';

  return {
    mode,
    labels: filtered.labels,
    values: filtered.values,
    total,
    aria: `HTTP status distribution. ${formatCompositionAria(filtered.labels, filtered.values, 'URLs')}`,
  };
}

/** From crawl summary fields (Content Analytics). */
export function statusDistributionFromSummary(summary: {
  count_2xx?: number | null;
  count_3xx?: number | null;
  count_4xx?: number | null;
  count_5xx?: number | null;
  count_error?: number | null;
}): StatusDistribution | null {
  return buildFromBuckets({
    ok2xx: Number(summary.count_2xx) || 0,
    redirect3xx: Number(summary.count_3xx) || 0,
    client4xx: Number(summary.count_4xx) || 0,
    server5xx: Number(summary.count_5xx) || 0,
    error: Number(summary.count_error) || 0,
  });
}

/** From raw status_counts map (Overview). Always groups to 2xx/3xx/4xx/5xx/error for consistency. */
export function statusDistributionFromCounts(
  counts: Record<string, number> | null | undefined,
): StatusDistribution | null {
  if (!counts || typeof counts !== 'object') return null;

  const buckets: Record<keyof typeof STATUS_GROUP_LABELS, number> = {
    ok2xx: 0,
    redirect3xx: 0,
    client4xx: 0,
    server5xx: 0,
    error: 0,
  };

  Object.entries(counts).forEach(([code, raw]) => {
    const group = classifyStatusCode(String(code).trim());
    if (group) buckets[group] += Number(raw) || 0;
  });

  return buildFromBuckets(buckets);
}
