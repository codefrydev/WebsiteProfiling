
import type { ComponentType } from 'react';
import type { VizType } from '@/lib/dashboard/types';
import type { VizRenderProps } from '@/lib/dashboard/viz/types';
import { KpiViz, StatCardViz } from '@/lib/dashboard/viz/metrics/KpiViz';
import { GaugeViz } from '@/lib/dashboard/viz/metrics/GaugeViz';
import { SparklineViz } from '@/lib/dashboard/viz/metrics/SparklineViz';
import { BarViz, HorizontalBarViz, RankedBarViz } from '@/lib/dashboard/viz/charts/BarViz';
import { LineViz, AreaViz } from '@/lib/dashboard/viz/charts/LineViz';
import { PieViz, DoughnutViz, StackedBarViz } from '@/lib/dashboard/viz/charts/PartViz';
import { TableViz } from '@/lib/dashboard/viz/data/TableViz';
import { MarkdownViz } from '@/lib/dashboard/viz/data/MarkdownViz';
import { CustomChartViz } from '@/lib/dashboard/viz/charts/CustomChartViz';

const VIZ_REGISTRY: Record<VizType, ComponentType<VizRenderProps>> = {
  kpi: KpiViz,
  'stat-card': StatCardViz,
  gauge: GaugeViz,
  sparkline: SparklineViz,
  bar: BarViz,
  'horizontal-bar': HorizontalBarViz,
  'ranked-bar': RankedBarViz,
  line: LineViz,
  area: AreaViz,
  pie: PieViz,
  doughnut: DoughnutViz,
  'stacked-bar': StackedBarViz,
  table: TableViz,
  markdown: MarkdownViz,
  'custom-chart': CustomChartViz,
};

export function renderViz(viz: VizType, props: VizRenderProps) {
  const Component = VIZ_REGISTRY[viz];
  return <Component {...props} />;
}

export function isDataViz(viz: VizType): boolean {
  return viz !== 'markdown';
}

export { VIZ_REGISTRY };
