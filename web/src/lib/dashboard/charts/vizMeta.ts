/** Display metadata + shelf requirements for each viz type (drives the gallery). */
import type { VizType, QuerySpec } from '@/lib/dashboard/engine/types';

export interface VizMeta {
  label: string;
  group: 'Metric' | 'Bar' | 'Trend' | 'Part' | 'Relationship' | 'Data';
  /** Renders a single value (uses scalar). */
  scalar?: boolean;
  /** Needs a Category dimension (group-by). */
  needsCategory?: boolean;
  /** Minimum measures on the Values shelf. */
  minMeasures?: number;
  /** Needs a Legend/series dimension. */
  needsSeries?: boolean;
}

export const VIZ_META: Record<VizType, VizMeta> = {
  kpi: { label: 'KPI number', group: 'Metric', scalar: true, minMeasures: 1 },
  'stat-card': { label: 'Stat card', group: 'Metric', scalar: true, minMeasures: 1 },
  gauge: { label: 'Gauge', group: 'Metric', scalar: true, minMeasures: 1 },
  sparkline: { label: 'Sparkline', group: 'Metric', needsCategory: true, minMeasures: 1 },
  bar: { label: 'Bar', group: 'Bar', needsCategory: true, minMeasures: 1 },
  'horizontal-bar': { label: 'Horizontal bar', group: 'Bar', needsCategory: true, minMeasures: 1 },
  'stacked-bar': { label: 'Stacked bar', group: 'Bar', needsCategory: true, minMeasures: 1, needsSeries: true },
  line: { label: 'Line', group: 'Trend', needsCategory: true, minMeasures: 1 },
  area: { label: 'Area', group: 'Trend', needsCategory: true, minMeasures: 1 },
  pie: { label: 'Pie', group: 'Part', needsCategory: true, minMeasures: 1 },
  doughnut: { label: 'Doughnut', group: 'Part', needsCategory: true, minMeasures: 1 },
  treemap: { label: 'Treemap', group: 'Part', needsCategory: true, minMeasures: 1 },
  funnel: { label: 'Funnel', group: 'Part', needsCategory: true, minMeasures: 1 },
  scatter: { label: 'Scatter', group: 'Relationship', minMeasures: 2 },
  radar: { label: 'Radar', group: 'Relationship', needsCategory: true, minMeasures: 1 },
  heatmap: { label: 'Heatmap', group: 'Relationship', needsCategory: true, needsSeries: true, minMeasures: 1 },
  table: { label: 'Table', group: 'Data' },
  text: { label: 'Text', group: 'Data' },
};

export const ALL_VIZ = Object.keys(VIZ_META) as VizType[];

export const VIZ_LABELS: Record<VizType, string> = Object.fromEntries(
  ALL_VIZ.map((v) => [v, VIZ_META[v].label]),
) as Record<VizType, string>;

/** Whether a viz can be satisfied by the current query spec (for greying out the gallery). */
export function vizFitsSpec(viz: VizType, spec: QuerySpec): boolean {
  const m = VIZ_META[viz];
  const measures = spec.measures?.length ?? 0;
  if (m.minMeasures && measures < m.minMeasures) return false;
  if (m.needsCategory && !spec.groupBy) return false;
  if (m.needsSeries && !spec.series) return false;
  return true;
}
