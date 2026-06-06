'use client';

import { BarChart3 } from 'lucide-react';
import { Bar } from 'react-chartjs-2';
import { strings, format } from '@/lib/strings';
import { Card, StatCard } from '@/components';
import { StatusDistributionChart, LighthouseScoreGrid } from '@/components/charts';
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
  const opts = chart.horizontal
    ? barOptionsHorizontal()
    : barOptsVertical(yTitle, chart.aria);
  return (
    <div className={chart.horizontal ? 'h-56' : 'h-56'} role="img" aria-label={chart.aria}>
      <Bar data={chart.data} options={opts} />
    </div>
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {statusDistribution && (
              <Card shadow>
                <h3 className="text-sm font-bold text-foreground mb-1">{vo.statusDist}</h3>
                <p className="text-xs text-muted-foreground mb-3">{vo.statusDistHint}</p>
                <StatusDistributionChart distribution={statusDistribution} />
              </Card>
            )}
            {wordCountChart && (
              <Card shadow>
                <h3 className="text-sm font-bold text-foreground mb-1">{vo.contentDepth}</h3>
                <p className="text-xs text-muted-foreground mb-3">{vo.contentDepthHint}</p>
                <OverviewBarChart chart={wordCountChart} yTitle={vo.chartPages} />
              </Card>
            )}
            {responseTimeChart && (
              <Card shadow>
                <h3 className="text-sm font-bold text-foreground mb-1">{vo.serverLatency}</h3>
                <p className="text-xs text-muted-foreground mb-3">{vo.serverLatencyHint}</p>
                <OverviewBarChart chart={responseTimeChart} yTitle={vo.chartUrls} />
              </Card>
            )}
            {depthChart && (
              <Card shadow>
                <h3 className="text-sm font-bold text-foreground mb-1">{vo.crawlDepth}</h3>
                <p className="text-xs text-muted-foreground mb-3">{vo.crawlDepthHint}</p>
                <div className="text-xs text-muted-foreground mb-2 tabular-nums">
                  {format(vo.depthSummaryLine, {
                    maxDepth: depth.max_depth ?? sj.emDash,
                    avgDepth: depth.avg_depth ?? sj.emDash,
                  })}
                </div>
                <div className="h-52" role="img" aria-label={depthChart.aria}>
                  <Bar data={depthChart.data} options={barOptsVertical(vo.chartUrls, depthChart.aria)} />
                </div>
              </Card>
            )}
            {titleMetaChart && (
              <Card shadow>
                <h3 className="text-sm font-bold text-foreground mb-1">{vo.titleMetaHealth}</h3>
                <p className="text-xs text-muted-foreground mb-3">{vo.titleMetaHint}</p>
                <div className="h-64" role="img" aria-label={titleMetaChart.aria}>
                  <Bar data={titleMetaChart.data} options={barOptsGrouped(vo.chartPages)} />
                </div>
              </Card>
            )}
            {socialStats && (
              <Card shadow>
                <h3 className="text-sm font-bold text-foreground mb-1">{vo.socialPreview}</h3>
                <p className="text-xs text-muted-foreground mb-3">{vo.socialPreviewHint}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" role="group" aria-label={socialStats.aria}>
                  {socialStats.og != null && (
                    <StatCard label={vo.socialLabelsOg} value={`${socialStats.og.toFixed(1)}%`} sub={pct} />
                  )}
                  {socialStats.twitter != null && (
                    <StatCard label={vo.socialLabelsTwitter} value={`${socialStats.twitter.toFixed(1)}%`} sub={pct} />
                  )}
                  {socialStats.ogImage != null && (
                    <StatCard label={vo.socialLabelsOgImage} value={`${socialStats.ogImage.toFixed(1)}%`} sub={pct} />
                  )}
                </div>
              </Card>
            )}
            {readingLevelChart && (
              <Card shadow>
                <h3 className="text-sm font-bold text-foreground mb-1">{vo.readingLevel}</h3>
                <p className="text-xs text-muted-foreground mb-3">{vo.readingLevelHint}</p>
                <OverviewBarChart chart={readingLevelChart} yTitle={vo.chartPages} />
              </Card>
            )}
            {mimeChart && (
              <Card shadow>
                <h3 className="text-sm font-bold text-foreground mb-1">{vo.topMime}</h3>
                <p className="text-xs text-muted-foreground mb-3">{vo.topMimeHint}</p>
                <OverviewBarChart chart={mimeChart} yTitle={vo.chartUrls} />
              </Card>
            )}
            {outlinksChart && (
              <Card shadow>
                <h3 className="text-sm font-bold text-foreground mb-1">{vo.outlinksTitle}</h3>
                <p className="text-xs text-muted-foreground mb-3">{vo.outlinksHint}</p>
                <OverviewBarChart chart={outlinksChart} yTitle={vo.chartUrls} />
              </Card>
            )}
            {domainsChart && (
              <Card shadow className="lg:col-span-2">
                <h3 className="text-sm font-bold text-foreground mb-1">{vo.topDomains}</h3>
                <p className="text-xs text-muted-foreground mb-3">{vo.topDomainsHint}</p>
                <OverviewBarChart chart={domainsChart} yTitle={vo.chartUrls} />
              </Card>
            )}
            {lighthouseScores && (
              <Card shadow className="lg:col-span-2">
                <h3 className="text-sm font-bold text-foreground mb-1">{vo.lhCategoryScores}</h3>
                <p className="text-xs text-muted-foreground mb-3">{vo.lhCategoryHint}</p>
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
