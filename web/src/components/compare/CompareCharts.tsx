'use client';

import { useMemo } from 'react';
import { useReport } from '@/context/useReport';
import type { CompareMetricRow, ReportCompareSummary } from '@/lib/reportCompare';
import {
  buildAlignedDailySeries,
  buildMetricsBarChart,
  buildPriorityChart,
  buildStatusDistributionChart,
  hasGoogleDaily,
  pickMetricsForChart,
  type DualSeriesChartData,
} from '@/lib/compareChartData';
import { dualSeriesToBarChartData } from '@/lib/viz/adapters';
import { palette } from '@/utils/chartPalette';
import ChartCard from '@/components/ChartCard';
import { D3GroupedBarChart, D3DualLineChart, D3VerticalBarChart } from '@/components/charts/d3';

type CompareChartStrings = (typeof import('@/lib/strings').strings)['views']['compare'];

const COMPARE_CHART_HEIGHT = 'h-64';

/** Thin wrapper: converts DualSeriesChartData → BarChartData for D3GroupedBarChart. */
function CompareDualBar({
  series,
  baselineLabel,
  currentLabel,
  ariaLabel,
}: {
  series: DualSeriesChartData;
  baselineLabel: string;
  currentLabel: string;
  ariaLabel?: string;
}) {
  const data = useMemo(
    () => dualSeriesToBarChartData(series, baselineLabel, currentLabel),
    [series, baselineLabel, currentLabel],
  );
  return <D3GroupedBarChart data={data} ariaLabel={ariaLabel} heightClass={COMPARE_CHART_HEIGHT} />;
}

interface CompareOverviewChartsProps {
  compare: ReportCompareSummary;
  metrics: CompareMetricRow[];
  vc: CompareChartStrings;
}

export function CompareOverviewCharts({ compare, metrics, vc }: CompareOverviewChartsProps) {
  const { data, compareData } = useReport();

  const barMetrics = useMemo(() => pickMetricsForChart(metrics), [metrics]);
  const metricsSeries = useMemo(() => buildMetricsBarChart(barMetrics), [barMetrics]);

  const statusSeries = useMemo(() => {
    if (!data || !compareData) return null;
    return buildStatusDistributionChart(data, compareData);
  }, [data, compareData]);

  const prioritySeries = useMemo(
    () => buildPriorityChart(compare.extras.priorityCounts),
    [compare.extras.priorityCounts],
  );

  const hasStatus =
    statusSeries != null &&
    (statusSeries.current.some((v) => v != null && v > 0) ||
      statusSeries.baseline.some((v) => v != null && v > 0));
  const hasPriority =
    prioritySeries.current.some((n) => (n ?? 0) > 0) ||
    prioritySeries.baseline.some((n) => (n ?? 0) > 0);

  if (barMetrics.length === 0 && !hasStatus && !hasPriority) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {barMetrics.length > 0 ? (
        <ChartCard title={vc.chartSiteMetrics} hint={vc.chartLegendHint} heightClass={COMPARE_CHART_HEIGHT}>
          <CompareDualBar
            series={metricsSeries}
            baselineLabel={vc.legendBaseline}
            currentLabel={vc.legendCurrent}
            ariaLabel={vc.chartSiteMetrics}
          />
        </ChartCard>
      ) : null}
      {hasStatus && statusSeries ? (
        <ChartCard title={vc.chartStatusMix} hint={vc.chartLegendHint} heightClass={COMPARE_CHART_HEIGHT}>
          <CompareDualBar
            series={statusSeries}
            baselineLabel={vc.legendBaseline}
            currentLabel={vc.legendCurrent}
            ariaLabel={vc.chartStatusMix}
          />
        </ChartCard>
      ) : null}
      {hasPriority ? (
        <ChartCard title={vc.chartIssuesPriority} hint={vc.chartLegendHint} heightClass={COMPARE_CHART_HEIGHT}>
          <CompareDualBar
            series={prioritySeries}
            baselineLabel={vc.legendBaseline}
            currentLabel={vc.legendCurrent}
            ariaLabel={vc.chartIssuesPriority}
          />
        </ChartCard>
      ) : null}
    </div>
  );
}

interface CompareGoogleChartsProps {
  vc: CompareChartStrings;
}

export function CompareGoogleCharts({ vc }: CompareGoogleChartsProps) {
  const { data, compareData } = useReport();

  const daily = useMemo(() => {
    if (!data || !compareData) return { gsc: false, ga4: false };
    return hasGoogleDaily(data, compareData);
  }, [data, compareData]);

  const baseGsc = (compareData?.google?.gsc?.daily ?? []) as Array<Record<string, unknown>>;
  const curGsc = (data?.google?.gsc?.daily ?? []) as Array<Record<string, unknown>>;
  const baseGa4 = (compareData?.google?.ga4?.daily ?? []) as Array<Record<string, unknown>>;
  const curGa4 = (data?.google?.ga4?.daily ?? []) as Array<Record<string, unknown>>;

  const gscClicks = useMemo(
    () => (daily.gsc ? buildAlignedDailySeries(baseGsc, curGsc, 'clicks') : null),
    [daily.gsc, baseGsc, curGsc],
  );
  const gscImpressions = useMemo(
    () => (daily.gsc ? buildAlignedDailySeries(baseGsc, curGsc, 'impressions') : null),
    [daily.gsc, baseGsc, curGsc],
  );
  const ga4Sessions = useMemo(
    () => (daily.ga4 ? buildAlignedDailySeries(baseGa4, curGa4, 'sessions') : null),
    [daily.ga4, baseGa4, curGa4],
  );

  if (!daily.gsc && !daily.ga4) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {gscClicks ? (
        <ChartCard title={vc.chartGscClicks} hint={vc.chartDailyHint} heightClass={COMPARE_CHART_HEIGHT}>
          <D3DualLineChart
            series={gscClicks}
            baselineLabel={vc.legendBaseline}
            currentLabel={vc.legendCurrent}
            ariaLabel={vc.chartGscClicks}
          />
        </ChartCard>
      ) : null}
      {gscImpressions ? (
        <ChartCard title={vc.chartGscImpressions} hint={vc.chartDailyHint} heightClass={COMPARE_CHART_HEIGHT}>
          <D3DualLineChart
            series={gscImpressions}
            baselineLabel={vc.legendBaseline}
            currentLabel={vc.legendCurrent}
            ariaLabel={vc.chartGscImpressions}
          />
        </ChartCard>
      ) : null}
      {ga4Sessions ? (
        <ChartCard title={vc.chartGa4Sessions} hint={vc.chartDailyHint} heightClass={COMPARE_CHART_HEIGHT}>
          <D3DualLineChart
            series={ga4Sessions}
            baselineLabel={vc.legendBaseline}
            currentLabel={vc.legendCurrent}
            ariaLabel={vc.chartGa4Sessions}
          />
        </ChartCard>
      ) : null}
    </div>
  );
}

/** URL fingerprint change counts (single-run delta view). */
export function CompareUrlChangeChart({
  newCount,
  removedCount,
  contentCount,
  structureCount,
  vc,
}: {
  newCount: number;
  removedCount: number;
  contentCount: number;
  structureCount: number;
  vc: CompareChartStrings;
}) {
  const values = [newCount, removedCount, contentCount, structureCount];
  const total = values.reduce((a, b) => a + b, 0);
  const labels = [vc.urlTabs.new, vc.urlTabs.removed, vc.urlTabs.content, vc.urlTabs.structure];
  const colors = palette(4);

  const barData = useMemo(
    () => ({
      labels,
      series: [{ values, colors }],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [newCount, removedCount, contentCount, structureCount],
  );

  if (total === 0) return null;

  return (
    <ChartCard title={vc.chartUrlChanges} hint={vc.chartUrlChangesHint} heightClass={COMPARE_CHART_HEIGHT}>
      <D3VerticalBarChart data={barData} ariaLabel={vc.chartUrlChanges} heightClass={COMPARE_CHART_HEIGHT} />
    </ChartCard>
  );
}

/** Content & social metrics (baseline vs current grouped bars). */
export function CompareContentCharts({
  contentMetrics,
  vc,
}: {
  contentMetrics: CompareMetricRow[];
  vc: CompareChartStrings;
}) {
  const skip = new Set(['resp_p50', 'resp_p95', 'crawl_time']);
  const rows = contentMetrics.filter((m) => !skip.has(m.id));
  const series = buildMetricsBarChart(rows);
  if (!series.labels.length) return null;

  return (
    <ChartCard title={vc.chartContent} hint={vc.chartLegendHint} heightClass={COMPARE_CHART_HEIGHT}>
      <CompareDualBar
        series={series}
        baselineLabel={vc.legendBaseline}
        currentLabel={vc.legendCurrent}
        ariaLabel={vc.chartContent}
      />
    </ChartCard>
  );
}

/** Lighthouse + response metrics (baseline vs current grouped bars). */
export function ComparePerformanceCharts({
  siteMetrics,
  contentMetrics,
  vc,
}: {
  siteMetrics: CompareMetricRow[];
  contentMetrics: CompareMetricRow[];
  vc: CompareChartStrings;
}) {
  const ids = ['lh_perf', 'lh_seo', 'resp_p50', 'resp_p95', 'crawl_time'];
  const perfRows = [
    ...siteMetrics.filter((m) => ids.includes(m.id)),
    ...contentMetrics.filter((m) => ['resp_p50', 'resp_p95', 'crawl_time'].includes(m.id)),
  ].filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i);

  const series = buildMetricsBarChart(perfRows);
  if (!series.labels.length) return null;

  return (
    <ChartCard title={vc.chartPerformance} hint={vc.chartLegendHint} heightClass={COMPARE_CHART_HEIGHT}>
      <CompareDualBar
        series={series}
        baselineLabel={vc.legendBaseline}
        currentLabel={vc.legendCurrent}
        ariaLabel={vc.chartPerformance}
      />
    </ChartCard>
  );
}
