import type { BarChartData } from '@/lib/viz/types';
import type { StatusDistribution } from '@/lib/statusDistribution';

export const OVERVIEW_TABS = ['summary', 'charts', 'health', 'pages'] as const;
export type OverviewTabId = (typeof OVERVIEW_TABS)[number];

export interface OverviewChartInsightMeta {
  takeaway?: string;
  viewHref?: string;
  viewLabel?: string;
}

export interface OverviewChartBlock extends OverviewChartInsightMeta {
  data: BarChartData;
  aria: string;
  /** Render with horizontal bars (indexAxis y). */
  horizontal?: boolean;
}

export interface OverviewStatusChart extends OverviewChartInsightMeta {
  distribution: StatusDistribution;
}

export interface OverviewSocialStats extends OverviewChartInsightMeta {
  og: number | null;
  twitter: number | null;
  ogImage: number | null;
  aria: string;
}

export interface OverviewLighthouseScores extends OverviewChartInsightMeta {
  scores: Record<string, number | null>;
  aria: string;
}

export interface OverviewCharts {
  statusDistribution: OverviewStatusChart | null;
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
  concernCount: number;
  hasInsightCharts: boolean;
}
