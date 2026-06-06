'use client';

import { BarChart3 } from 'lucide-react';
import { Bar } from 'react-chartjs-2';
import { strings, format } from '@/lib/strings';
import { Card } from '@/components';
import type { ReportPayload } from '@/types';
import type { OverviewCharts } from './types';
import { OverviewTabPanel } from './OverviewTabPanel';
import { ensureOverviewChartsRegistered } from './chartSetup';
import {
  barOptsVertical,
  barOptsGrouped,
  barOptsSocial,
  barOptsLighthouse,
} from './chartUtils';

ensureOverviewChartsRegistered();

export interface OverviewChartsTabProps {
  charts: OverviewCharts;
  depth: NonNullable<ReportPayload['depth_distribution']>;
}

export function OverviewChartsTab({ charts, depth }: OverviewChartsTabProps) {
  const vo = strings.views.overview;
  const sj = strings.common;
  const {
    wordCountChart,
    responseTimeChart,
    depthChart,
    titleMetaChart,
    socialChart,
    readingLevelChart,
    mimeChart,
    lighthouseChart,
    hasInsightCharts,
  } = charts;

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
            {wordCountChart && (
              <Card shadow>
                <h3 className="text-sm font-bold text-foreground mb-1">{vo.contentDepth}</h3>
                <p className="text-xs text-muted-foreground mb-3">{vo.contentDepthHint}</p>
                <div className="h-56" role="img" aria-label={wordCountChart.aria}>
                  <Bar data={wordCountChart.data} options={barOptsVertical(vo.chartPages, wordCountChart.aria)} />
                </div>
              </Card>
            )}
            {responseTimeChart && (
              <Card shadow>
                <h3 className="text-sm font-bold text-foreground mb-1">{vo.serverLatency}</h3>
                <p className="text-xs text-muted-foreground mb-3">{vo.serverLatencyHint}</p>
                <div className="h-56" role="img" aria-label={responseTimeChart.aria}>
                  <Bar data={responseTimeChart.data} options={barOptsVertical(vo.chartUrls, responseTimeChart.aria)} />
                </div>
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
            {socialChart && (
              <Card shadow>
                <h3 className="text-sm font-bold text-foreground mb-1">{vo.socialPreview}</h3>
                <p className="text-xs text-muted-foreground mb-3">{vo.socialPreviewHint}</p>
                <div className="h-44" role="img" aria-label={socialChart.aria}>
                  <Bar data={socialChart.data} options={barOptsSocial()} />
                </div>
              </Card>
            )}
            {readingLevelChart && (
              <Card shadow>
                <h3 className="text-sm font-bold text-foreground mb-1">{vo.readingLevel}</h3>
                <p className="text-xs text-muted-foreground mb-3">{vo.readingLevelHint}</p>
                <div className="h-56" role="img" aria-label={readingLevelChart.aria}>
                  <Bar
                    data={readingLevelChart.data}
                    options={barOptsVertical(vo.chartPages, readingLevelChart.aria)}
                  />
                </div>
              </Card>
            )}
            {mimeChart && (
              <Card shadow>
                <h3 className="text-sm font-bold text-foreground mb-1">{vo.topMime}</h3>
                <p className="text-xs text-muted-foreground mb-3">{vo.topMimeHint}</p>
                <div className="h-56" role="img" aria-label={mimeChart.aria}>
                  <Bar data={mimeChart.data} options={barOptsVertical(vo.chartUrls, mimeChart.aria)} />
                </div>
              </Card>
            )}
            {lighthouseChart && (
              <Card shadow className="lg:col-span-2">
                <h3 className="text-sm font-bold text-foreground mb-1">{vo.lhCategoryScores}</h3>
                <p className="text-xs text-muted-foreground mb-3">{vo.lhCategoryHint}</p>
                <div className="h-48 max-w-2xl" role="img" aria-label={lighthouseChart.aria}>
                  <Bar data={lighthouseChart.data} options={barOptsLighthouse()} />
                </div>
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
