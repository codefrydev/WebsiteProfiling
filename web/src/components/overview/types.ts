import type { ChartData } from 'chart.js';

export const OVERVIEW_TABS = ['summary', 'charts', 'health', 'pages'] as const;
export type OverviewTabId = (typeof OVERVIEW_TABS)[number];

export interface OverviewChartBlock {
  data: ChartData<'bar'>;
  aria: string;
}

export interface OverviewCharts {
  wordCountChart: OverviewChartBlock | null;
  responseTimeChart: OverviewChartBlock | null;
  depthChart: OverviewChartBlock | null;
  titleMetaChart: OverviewChartBlock | null;
  socialChart: OverviewChartBlock | null;
  readingLevelChart: OverviewChartBlock | null;
  mimeChart: OverviewChartBlock | null;
  lighthouseChart: OverviewChartBlock | null;
  chartCount: number;
  hasInsightCharts: boolean;
}
