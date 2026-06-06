import type { ChartData } from 'chart.js';
import type { StatusDistribution } from '@/lib/statusDistribution';

export const OVERVIEW_TABS = ['summary', 'charts', 'health', 'pages'] as const;
export type OverviewTabId = (typeof OVERVIEW_TABS)[number];

export interface OverviewChartBlock {
  data: ChartData<'bar'>;
  aria: string;
  /** Render with horizontal bars (indexAxis y). */
  horizontal?: boolean;
}

export interface OverviewSocialStats {
  og: number | null;
  twitter: number | null;
  ogImage: number | null;
  aria: string;
}

export interface OverviewLighthouseScores {
  scores: Record<string, number | null>;
  aria: string;
}

export interface OverviewCharts {
  statusDistribution: StatusDistribution | null;
  wordCountChart: OverviewChartBlock | null;
  responseTimeChart: OverviewChartBlock | null;
  depthChart: OverviewChartBlock | null;
  titleMetaChart: OverviewChartBlock | null;
  socialStats: OverviewSocialStats | null;
  readingLevelChart: OverviewChartBlock | null;
  mimeChart: OverviewChartBlock | null;
  outlinksChart: OverviewChartBlock | null;
  domainsChart: OverviewChartBlock | null;
  lighthouseScores: OverviewLighthouseScores | null;
  chartCount: number;
  hasInsightCharts: boolean;
}
