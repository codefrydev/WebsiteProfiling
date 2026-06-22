import type { VizType } from '@/lib/dashboard/types';

export const VIZ_LABELS: Record<VizType, string> = {
  kpi: 'KPI (number)',
  'stat-card': 'Stat card',
  gauge: 'Gauge',
  bar: 'Vertical bar chart',
  'horizontal-bar': 'Horizontal bar chart',
  'ranked-bar': 'Ranked bar chart',
  'stacked-bar': 'Stacked proportion bar',
  line: 'Line chart',
  area: 'Area chart',
  sparkline: 'Sparkline trend',
  pie: 'Pie chart',
  doughnut: 'Doughnut chart',
  table: 'Table',
  markdown: 'Text / Markdown',
  'custom-chart': 'Custom chart (AI)',
};

/** Viz types grouped for the widget picker sidebar. */
export const VIZ_GROUPS: { label: string; types: VizType[] }[] = [
  { label: 'Metrics', types: ['kpi', 'stat-card', 'gauge', 'sparkline'] },
  { label: 'Bars', types: ['bar', 'horizontal-bar', 'ranked-bar', 'stacked-bar'] },
  { label: 'Trends', types: ['line', 'area'] },
  { label: 'Parts', types: ['pie', 'doughnut'] },
  { label: 'Data', types: ['table', 'markdown'] },
  { label: 'AI', types: ['custom-chart'] },
];
