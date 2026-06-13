'use client';

import { BarChart3 } from 'lucide-react';
import { Bar } from 'react-chartjs-2';
import { strings, format } from '@/lib/strings';
import { Card, StatCard, ChartTitleWithHint } from '@/components';
import { metricHelpHint } from '@/lib/metricHelp';
import { StatusDistributionChart, LighthouseScoreGrid } from '@/components/charts';
import { ChartPanel } from '@/components/charts';
import { barOptionsHorizontal } from '@/utils/chartJsDefaults';
import type { ReportPayload } from '@/types';
import type { OverviewChartBlock, OverviewCharts } from './types';
import { OverviewTabPanel } from './OverviewTabPanel';
import { ensureOverviewChartsRegistered } from './chartSetup';
import { barOptsVertical, barOptsGrouped } from './chartUtils';

ensureOverviewChartsRegistered();

function OverviewBarChart({
  chart,
  yTitle,
}: {
  chart: OverviewChartBlock;
  yTitle: string;
}) {
  const labels = chart.data.labels?.map(String) ?? [];
  const opts = chart.horizontal
    ? barOptionsHorizontal(undefined, labels)
    : barOptsVertical(yTitle, chart.aria);
  return (
    <ChartPanel>
      <div className="h-full w-full" role="img" aria-label={chart.aria}>
        <Bar data={chart.data} options={opts} />
      </div>
    </ChartPanel>
  );
}

export interface OverviewChartsTabProps {
  charts: OverviewCharts;
  depth: NonNullable<ReportPayload['depth_distribution']>;
}

export function OverviewChartsTab({ charts, depth }: OverviewChartsTabProps) {
  const vo = strings.views.overview;
  const sj = strings.common;
  const pct = strings.common.percentOfPages;
  const {
    statusDistribution,
    wordCountChart,
    responseTimeChart,
    depthChart,
    titleMetaChart,
    socialStats,
    readingLevelChart,
    mimeChart,
    outlinksChart,
    domainsChart,
    lighthouseScores,
    hasInsightCharts,
  } = charts;
  const lhLabels = strings.lighthouse.categoryLabels as Record<string, string>;

  return (
    <OverviewTabPanel tabId="charts" className="space-y-6">
      {hasInsightCharts ? (
        <div>
          <h2 className="text-xl font-bold text-bright mb-1 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
            {vo.insightsGlance}
          </h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-3xl">{vo.insightsHint}</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-w-0">
            {statusDistribution && (
              <Card shadow>
                <ChartTitleWithHint title={vo.statusDist} helpKey="views.overview.statusDistChart" />
                <StatusDistributionChart distribution={statusDistribution} />
              </Card>
            )}
            {wordCountChart && (
              <Card shadow>
                <ChartTitleWithHint title={vo.contentDepth} helpKey="views.overview.contentDepthChart" />
                <OverviewBarChart chart={wordCountChart} yTitle={vo.chartPages} />
              </Card>
            )}
            {responseTimeChart && (
              <Card shadow>
                <ChartTitleWithHint title={vo.serverLatency} helpKey="views.overview.serverLatencyChart" />
                <OverviewBarChart chart={responseTimeChart} yTitle={vo.chartUrls} />
              </Card>
            )}
            {depthChart && (
              <Card shadow>
                <ChartTitleWithHint title={vo.crawlDepth} helpKey="views.overview.crawlDepthChart" />
                <div className="text-xs text-muted-foreground mb-2 tabular-nums">
                  {format(vo.depthSummaryLine, {
                    maxDepth: depth.max_depth ?? sj.emDash,
                    avgDepth: depth.avg_depth ?? sj.emDash,
                  })}
                </div>
                <ChartPanel heightClass="h-52">
                  <div className="h-full w-full" role="img" aria-label={depthChart.aria}>
                    <Bar data={depthChart.data} options={barOptsVertical(vo.chartUrls, depthChart.aria)} />
                  </div>
                </ChartPanel>
              </Card>
            )}
            {titleMetaChart && (
              <Card shadow>
                <ChartTitleWithHint title={vo.titleMetaHealth} helpKey="views.overview.titleMetaChart" />
                <ChartPanel heightClass="h-64">
                  <div className="h-full w-full" role="img" aria-label={titleMetaChart.aria}>
                    <Bar data={titleMetaChart.data} options={barOptsGrouped(vo.chartPages)} />
                  </div>
                </ChartPanel>
              </Card>
            )}
            {socialStats && (
              <Card shadow>
                <ChartTitleWithHint title={vo.socialPreview} hint={vo.socialPreviewHint} />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" role="group" aria-label={socialStats.aria}>
                  {socialStats.og != null && (
                    <StatCard
                      label={vo.socialLabelsOg}
                      value={`${socialStats.og.toFixed(1)}%`}
                      sub={pct}
                      hint={metricHelpHint('views.overview.ogCoverage')}
                    />
                  )}
                  {socialStats.twitter != null && (
                    <StatCard
                      label={vo.socialLabelsTwitter}
                      value={`${socialStats.twitter.toFixed(1)}%`}
                      sub={pct}
                      hint={metricHelpHint('views.overview.twitterCoverage')}
                    />
                  )}
                  {socialStats.ogImage != null && (
                    <StatCard
                      label={vo.socialLabelsOgImage}
                      value={`${socialStats.ogImage.toFixed(1)}%`}
                      sub={pct}
                      hint={metricHelpHint('views.overview.ogImageCoverage')}
                    />
                  )}
                </div>
              </Card>
            )}
            {readingLevelChart && (
              <Card shadow>
                <ChartTitleWithHint title={vo.readingLevel} hint={vo.readingLevelHint} />
                <OverviewBarChart chart={readingLevelChart} yTitle={vo.chartPages} />
              </Card>
            )}
            {mimeChart && (
              <Card shadow>
                <ChartTitleWithHint title={vo.topMime} helpKey="views.overview.mimeChart" />
                <OverviewBarChart chart={mimeChart} yTitle={vo.chartUrls} />
              </Card>
            )}
            {outlinksChart && (
              <Card shadow>
                <ChartTitleWithHint title={vo.outlinksTitle} helpKey="views.overview.outlinksChart" />
                <OverviewBarChart chart={outlinksChart} yTitle={vo.chartUrls} />
              </Card>
            )}
            {domainsChart && (
              <Card shadow className="lg:col-span-2">
                <ChartTitleWithHint title={vo.topDomains} helpKey="views.overview.topDomainsChart" />
                <OverviewBarChart chart={domainsChart} yTitle={vo.chartUrls} />
              </Card>
            )}
            {lighthouseScores && (
              <Card shadow className="lg:col-span-2">
                <ChartTitleWithHint title={vo.lhCategoryScores} helpKey="views.overview.lhCategoryChart" />
                <LighthouseScoreGrid
                  scores={lighthouseScores.scores}
                  categoryLabels={lhLabels}
                  aria={lighthouseScores.aria}
                />
              </Card>
            )}
          </div>
        </div>
      ) : (
        <Card className="p-8 text-center text-muted-foreground text-sm">{vo.chartsEmpty}</Card>
      )}
    </OverviewTabPanel>
  );
}
