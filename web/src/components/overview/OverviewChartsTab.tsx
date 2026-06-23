
import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  BarChart3,
  ChevronRight,
  Globe,
  Link2,
  Share2,
  Sparkles,
  Zap,
} from 'lucide-react';
import { strings, format } from '@/lib/strings';
import { Card, ChartTitleWithHint } from '@/components';
import { ChartBlockSkeleton } from '@/components/SectionWidgetSkeleton';
import { OVERVIEW_TAB_SECTIONS, isSectionPending } from '@/lib/reportViewSections';
import { useTabSections } from '@/hooks/useTabSections';
import { ScoreRing } from '@/components/lighthouse';
import { StatusDistributionChart, LighthouseScoreGrid } from '@/components/charts';
import { D3VerticalBarChart } from '@/components/charts/d3/D3VerticalBarChart';
import { D3HorizontalBarChart } from '@/components/charts/d3/D3HorizontalBarChart';
import { D3GroupedBarChart } from '@/components/charts/d3/D3GroupedBarChart';
import type { ReportPayload } from '@/types';
import type { OverviewChartBlock, OverviewCharts } from './types';
import { OverviewTabPanel } from './OverviewTabPanel';
import { selectChartConcerns } from './overviewChartInsights';

const vo = strings.views.overview;
const sj = strings.common;
const lhLabels = strings.lighthouse.categoryLabels as Record<string, string>;
const CHART_HEIGHT = 'h-64';

function ChartSection({
  title,
  hint,
  icon,
  children,
}: {
  title: string;
  hint: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
        <div>
          <h3 className="text-sm font-bold text-bright">{title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">{children}</div>
    </section>
  );
}

function ChartInsightCard({
  title,
  helpKey,
  hint,
  takeaway,
  viewHref,
  viewLabel,
  className = '',
  children,
}: {
  title: string;
  helpKey?: string;
  hint?: string;
  takeaway?: string;
  viewHref?: string;
  viewLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card shadow className={`flex h-full flex-col ${className}`.trim()}>
      <ChartTitleWithHint title={title} helpKey={helpKey} hint={hint} />
      {takeaway ? (
        <p className="mb-3 text-xs font-medium leading-relaxed text-foreground/90">{takeaway}</p>
      ) : null}
      <div className="min-h-0 flex-1">{children}</div>
      {viewHref && viewLabel ? (
        <Link
          to={viewHref}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-link hover:underline"
        >
          {viewLabel}
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </Card>
  );
}

function OverviewBarChart({
  chart,
  yTitle,
  heightClass = CHART_HEIGHT,
}: {
  chart: OverviewChartBlock;
  yTitle: string;
  heightClass?: string;
}) {
  if (chart.horizontal) {
    return (
      <D3HorizontalBarChart
        data={chart.data}
        xTitle={yTitle}
        ariaLabel={chart.aria}
        heightClass={heightClass}
      />
    );
  }
  return (
    <D3VerticalBarChart
      data={chart.data}
      yTitle={yTitle}
      ariaLabel={chart.aria}
      heightClass={heightClass}
    />
  );
}

function SocialCoverageRings({
  og,
  twitter,
  ogImage,
  aria,
}: {
  og: number | null;
  twitter: number | null;
  ogImage: number | null;
  aria: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3" role="group" aria-label={aria}>
      {og != null ? (
        <ScoreRing label={vo.socialLabelsOg} score={Math.round(og)} />
      ) : null}
      {twitter != null ? (
        <ScoreRing label={vo.socialLabelsTwitter} score={Math.round(twitter)} />
      ) : null}
      {ogImage != null ? (
        <ScoreRing label={vo.socialLabelsOgImage} score={Math.round(ogImage)} />
      ) : null}
    </div>
  );
}

export interface OverviewChartsTabProps {
  charts: OverviewCharts;
  depth: NonNullable<ReportPayload['depth_distribution']>;
  data: ReportPayload;
  querySuffix: string;
}

export function OverviewChartsTab({ charts, depth, data, querySuffix }: OverviewChartsTabProps) {
  const concerns = useMemo(() => selectChartConcerns({ data, querySuffix }), [data, querySuffix]);
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

  const hasCrawlSection = statusDistribution || responseTimeChart || depthChart;
  const hasContentSection = wordCountChart || titleMetaChart || readingLevelChart;
  const hasDiscoverySection = mimeChart || outlinksChart || domainsChart;

  const chartSectionStatus = useTabSections(OVERVIEW_TAB_SECTIONS.charts, true);
  const chartsPending = isSectionPending(OVERVIEW_TAB_SECTIONS.charts, chartSectionStatus);

  if (chartsPending && !hasInsightCharts) {
    return (
      <OverviewTabPanel tabId="charts" className="space-y-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartBlockSkeleton />
          <ChartBlockSkeleton />
          <ChartBlockSkeleton />
          <ChartBlockSkeleton />
        </div>
      </OverviewTabPanel>
    );
  }

  return (
    <OverviewTabPanel tabId="charts" className="space-y-8">
      {hasInsightCharts ? (
        <>
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 text-xl font-bold text-bright">
                  <BarChart3 className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden />
                  {vo.insightsGlance}
                </h2>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{vo.chartsSubtitle}</p>
              </div>
            </div>

            {concerns.length > 0 ? (
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {vo.chartsTopConcerns}
                </p>
                <div className="flex flex-wrap gap-2">
                  {concerns.map((concern) => (
                    <Link
                      key={concern.id}
                      to={concern.href}
                      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-amber-500/40 hover:bg-amber-500/15"
                    >
                      <AlertTriangle
                        className="h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400"
                        aria-hidden
                      />
                      <span className="truncate">{concern.label}</span>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {lighthouseScores ? (
            <ChartSection
              title={vo.chartsSectionSocialPerf}
              hint={vo.chartsSectionSocialPerfHint}
              icon={<Zap className="h-4 w-4" aria-hidden />}
            >
              <ChartInsightCard
                title={vo.lhCategoryScores}
                helpKey="views.overview.lhCategoryChart"
                takeaway={lighthouseScores.takeaway}
                viewHref={lighthouseScores.viewHref}
                viewLabel={lighthouseScores.viewLabel}
                className="lg:col-span-2"
              >
                <LighthouseScoreGrid
                  scores={lighthouseScores.scores}
                  categoryLabels={lhLabels}
                  aria={lighthouseScores.aria}
                />
              </ChartInsightCard>
            </ChartSection>
          ) : null}

          {hasCrawlSection ? (
            <ChartSection
              title={vo.chartsSectionCrawl}
              hint={vo.chartsSectionCrawlHint}
              icon={<Globe className="h-4 w-4" aria-hidden />}
            >
              {statusDistribution ? (
                <ChartInsightCard
                  title={vo.statusDist}
                  helpKey="views.overview.statusDistChart"
                  takeaway={statusDistribution.takeaway}
                  viewHref={statusDistribution.viewHref}
                  viewLabel={statusDistribution.viewLabel}
                >
                  <StatusDistributionChart distribution={statusDistribution.distribution} heightClass={CHART_HEIGHT} />
                </ChartInsightCard>
              ) : null}
              {responseTimeChart ? (
                <ChartInsightCard
                  title={vo.serverLatency}
                  hint={vo.serverLatencyHint}
                  takeaway={responseTimeChart.takeaway}
                  viewHref={responseTimeChart.viewHref}
                  viewLabel={responseTimeChart.viewLabel}
                >
                  <OverviewBarChart chart={responseTimeChart} yTitle={vo.chartUrls} />
                </ChartInsightCard>
              ) : null}
              {depthChart ? (
                <ChartInsightCard
                  title={vo.crawlDepth}
                  hint={vo.crawlDepthHint}
                  takeaway={depthChart.takeaway}
                  viewHref={depthChart.viewHref}
                  viewLabel={depthChart.viewLabel}
                >
                  <div className="mb-2 text-xs tabular-nums text-muted-foreground">
                    {format(vo.depthSummaryLine, {
                      maxDepth: depth.max_depth ?? sj.emDash,
                      avgDepth: depth.avg_depth ?? sj.emDash,
                    })}
                  </div>
                  <D3VerticalBarChart
                    data={depthChart.data}
                    yTitle={vo.chartUrls}
                    ariaLabel={depthChart.aria}
                    heightClass={CHART_HEIGHT}
                  />
                </ChartInsightCard>
              ) : null}
            </ChartSection>
          ) : null}

          {hasContentSection ? (
            <ChartSection
              title={vo.chartsSectionContent}
              hint={vo.chartsSectionContentHint}
              icon={<Sparkles className="h-4 w-4" aria-hidden />}
            >
              {wordCountChart ? (
                <ChartInsightCard
                  title={vo.contentDepth}
                  hint={vo.contentDepthHint}
                  takeaway={wordCountChart.takeaway}
                  viewHref={wordCountChart.viewHref}
                  viewLabel={wordCountChart.viewLabel}
                >
                  <OverviewBarChart chart={wordCountChart} yTitle={vo.chartPages} />
                </ChartInsightCard>
              ) : null}
              {titleMetaChart ? (
                <ChartInsightCard
                  title={vo.titleMetaHealth}
                  hint={vo.titleMetaHint}
                  takeaway={titleMetaChart.takeaway}
                  viewHref={titleMetaChart.viewHref}
                  viewLabel={titleMetaChart.viewLabel}
                >
                  <D3GroupedBarChart
                    data={titleMetaChart.data}
                    yTitle={vo.chartPages}
                    ariaLabel={titleMetaChart.aria}
                    heightClass={CHART_HEIGHT}
                  />
                </ChartInsightCard>
              ) : null}
              {readingLevelChart ? (
                <ChartInsightCard
                  title={vo.readingLevel}
                  hint={vo.readingLevelHint}
                  takeaway={readingLevelChart.takeaway}
                  viewHref={readingLevelChart.viewHref}
                  viewLabel={readingLevelChart.viewLabel}
                >
                  <OverviewBarChart chart={readingLevelChart} yTitle={vo.chartPages} />
                </ChartInsightCard>
              ) : null}
            </ChartSection>
          ) : null}

          {hasDiscoverySection ? (
            <ChartSection
              title={vo.chartsSectionDiscovery}
              hint={vo.chartsSectionDiscoveryHint}
              icon={<Link2 className="h-4 w-4" aria-hidden />}
            >
              {mimeChart ? (
                <ChartInsightCard
                  title={vo.topMime}
                  hint={vo.topMimeHint}
                  takeaway={mimeChart.takeaway}
                  viewHref={mimeChart.viewHref}
                  viewLabel={mimeChart.viewLabel}
                >
                  <OverviewBarChart chart={mimeChart} yTitle={vo.chartUrls} />
                </ChartInsightCard>
              ) : null}
              {outlinksChart ? (
                <ChartInsightCard
                  title={vo.outlinksTitle}
                  hint={vo.outlinksHint}
                  takeaway={outlinksChart.takeaway}
                  viewHref={outlinksChart.viewHref}
                  viewLabel={outlinksChart.viewLabel}
                >
                  <OverviewBarChart chart={outlinksChart} yTitle={vo.chartUrls} />
                </ChartInsightCard>
              ) : null}
              {domainsChart ? (
                <ChartInsightCard
                  title={vo.topDomains}
                  hint={vo.topDomainsHint}
                  takeaway={domainsChart.takeaway}
                  viewHref={domainsChart.viewHref}
                  viewLabel={domainsChart.viewLabel}
                  className="lg:col-span-2"
                >
                  <OverviewBarChart chart={domainsChart} yTitle={vo.chartUrls} heightClass="h-72" />
                </ChartInsightCard>
              ) : null}
            </ChartSection>
          ) : null}

          {socialStats ? (
            <ChartSection
              title={vo.socialPreview}
              hint={vo.socialPreviewHint}
              icon={<Share2 className="h-4 w-4" aria-hidden />}
            >
              <ChartInsightCard
                title={vo.socialPreview}
                hint={vo.socialPreviewHint}
                takeaway={socialStats.takeaway}
                viewHref={socialStats.viewHref}
                viewLabel={socialStats.viewLabel}
                className="lg:col-span-2"
              >
                <SocialCoverageRings
                  og={socialStats.og}
                  twitter={socialStats.twitter}
                  ogImage={socialStats.ogImage}
                  aria={socialStats.aria}
                />
              </ChartInsightCard>
            </ChartSection>
          ) : null}
        </>
      ) : (
        <Card className="p-8 text-center text-sm text-muted-foreground">{vo.chartsEmpty}</Card>
      )}
    </OverviewTabPanel>
  );
}
