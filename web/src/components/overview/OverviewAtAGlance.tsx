'use client';

import { useMemo, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { ReportPayload } from '@/types';
import { strings } from '@/lib/strings';
import { crawledUrlCount } from '@/lib/crawlCounts';
import { Card } from '@/components';
import {
  CompactWidget,
  CompactKpi,
  CompactDonut,
  CompactBarChart,
  CompactAreaSparkline,
} from '@/components/charts/compact';
import { ScoreRing } from '@/components/lighthouse';
import { buildViewHref } from './crawlSnapshotMetrics';
import {
  buildGscBarHeights,
  buildGscSparklinePoints,
  buildIssueMixSegments,
  countIssuesByPriority,
  pickLighthouseHighlights,
  shouldShowAtAGlance,
} from './overviewAtAGlanceMetrics';

const vo = strings.views.overview;
const lhLabels = vo.lighthouseCategoryLabels as Record<string, string>;

export type OverviewAtAGlanceVariant = 'summary' | 'charts';

export interface OverviewAtAGlanceProps {
  data: ReportPayload;
  querySuffix: string;
  lighthouseScores?: Record<string, number | null | undefined> | null;
  variant?: OverviewAtAGlanceVariant;
  /** When false, omit outer Card wrapper and section heading (for embedding in Charts tab) */
  showHeader?: boolean;
}

function WidgetLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col">
      {children}
      <Link
        href={href}
        className="mt-2 inline-flex items-center gap-1 text-[10px] font-medium text-link hover:underline sm:text-xs"
      >
        {label}
        <ChevronRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

export function OverviewCompactMetricsGrid({
  data,
  querySuffix,
  lighthouseScores,
  variant = 'summary',
}: OverviewAtAGlanceProps) {
  const urlCount = crawledUrlCount(data);
  const issueCounts = useMemo(() => countIssuesByPriority(data.categories), [data.categories]);
  const gscDaily = data.google?.gsc?.daily;
  const gscBarHeights = useMemo(() => buildGscBarHeights(gscDaily), [gscDaily]);
  const gscSparkline = useMemo(() => buildGscSparklinePoints(gscDaily), [gscDaily]);
  const issueSegments = useMemo(() => buildIssueMixSegments(issueCounts), [issueCounts]);
  const lhHighlights = useMemo(() => pickLighthouseHighlights(lighthouseScores), [lighthouseScores]);

  const issuesHref = buildViewHref('issues', querySuffix);
  const searchHref = buildViewHref('search-performance', querySuffix);
  const lighthouseHref = buildViewHref('lighthouse', querySuffix);
  const linksHref = buildViewHref('links', querySuffix);

  const gscClicks = data.google?.gsc?.summary?.clicks;
  const showKpiRow = variant === 'summary';
  const hasKpiData = urlCount > 0 || issueCounts.total > 0 || gscClicks != null;

  return (
    <div className="space-y-4">
      {showKpiRow && hasKpiData ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {urlCount > 0 ? (
            <Link href={linksHref} className="block transition-opacity hover:opacity-90">
              <CompactKpi label={vo.totalUrls} value={urlCount.toLocaleString()} />
            </Link>
          ) : null}
          {issueCounts.total > 0 ? (
            <Link href={issuesHref} className="block transition-opacity hover:opacity-90">
              <CompactKpi label={vo.atAGlanceIssuesKpi} value={issueCounts.total.toLocaleString()} accent />
            </Link>
          ) : null}
          {gscClicks != null ? (
            <Link href={searchHref} className="block transition-opacity hover:opacity-90">
              <CompactKpi label={vo.gscClicksCard} value={gscClicks.toLocaleString()} />
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {gscBarHeights ? (
          <CompactWidget title={vo.atAGlanceGscBarTitle}>
            <WidgetLink href={searchHref} label={vo.atAGlanceViewSearchPerformance}>
              <CompactBarChart heights={gscBarHeights} />
            </WidgetLink>
          </CompactWidget>
        ) : null}

        {issueSegments.length > 0 ? (
          <CompactWidget title={vo.atAGlanceIssueMixTitle}>
            <WidgetLink href={issuesHref} label={vo.viewAllIssues}>
              <CompactDonut segments={issueSegments} showCounts />
            </WidgetLink>
          </CompactWidget>
        ) : null}

        {gscSparkline ? (
          <CompactWidget title={vo.atAGlanceGscTrendTitle}>
            <WidgetLink href={searchHref} label={vo.atAGlanceViewSearchPerformance}>
              <CompactAreaSparkline points={gscSparkline} heightClass="h-10" />
            </WidgetLink>
          </CompactWidget>
        ) : null}

        {lhHighlights.length > 0 ? (
          <CompactWidget title={vo.chartLighthouse}>
            <WidgetLink href={lighthouseHref} label={vo.chartsViewLighthouse}>
              <div className="flex justify-around px-1">
                {lhHighlights.map(({ id, score }) => (
                  <ScoreRing
                    key={id}
                    label={lhLabels[id] || id}
                    score={score}
                    size="sm"
                  />
                ))}
              </div>
            </WidgetLink>
          </CompactWidget>
        ) : null}
      </div>
    </div>
  );
}

export function OverviewAtAGlance({
  data,
  querySuffix,
  lighthouseScores,
  variant = 'summary',
  showHeader = true,
}: OverviewAtAGlanceProps) {
  const urlCount = crawledUrlCount(data);
  const issueCounts = useMemo(() => countIssuesByPriority(data.categories), [data.categories]);
  const gscDaily = data.google?.gsc?.daily;

  const visible = shouldShowAtAGlance({
    urlCount,
    issueCounts,
    gscDaily,
    lighthouseScores,
  });

  if (!visible) return null;

  const grid = (
    <OverviewCompactMetricsGrid
      data={data}
      querySuffix={querySuffix}
      lighthouseScores={lighthouseScores}
      variant={variant}
    />
  );

  if (!showHeader) return grid;

  return (
    <Card shadow className="border border-default">
      <div className="p-4 sm:p-5">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-bright">{vo.atAGlanceTitle}</h2>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{vo.atAGlanceHint}</p>
        </div>
        {grid}
      </div>
    </Card>
  );
}
