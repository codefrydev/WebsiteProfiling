'use client';

import { useMemo, type ReactNode } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { useReport } from '@/context/useReport';
import type { CompareMetricRow, ReportCompareSummary } from '@/lib/reportCompare';
import type { ReportPayload } from '@/types/report';
import {
  buildAlignedDailySeries,
  buildMetricsBarChart,
  buildPriorityChart,
  buildStatusDistributionChart,
  hasGoogleDaily,
  pickMetricsForChart,
  type DualSeriesChartData,
} from '@/lib/compareChartData';
import { palette } from '@/utils/chartPalette';
import {
  getGridColor,
  getChartTitleColor,
  getChartLegendLabelColor,
} from '@/utils/chartJsDefaults';
import ChartCard from '@/components/ChartCard';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend);

const COLOR_BASELINE = '#94a3b8';
const COLOR_CURRENT = '#3b82f6';

type CompareChartStrings = (typeof import('@/lib/strings').strings)['views']['compare'];

function useChartOptions() {
  return useMemo(() => {
    const grid = getGridColor();
    const titleColor = getChartTitleColor();
    const legendColor = getChartLegendLabelColor();
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index' as const, intersect: false },
      plugins: {
        legend: {
          display: true,
          position: 'bottom' as const,
          labels: { color: legendColor, font: { size: 11 }, padding: 12 },
        },
        tooltip: { mode: 'index' as const, intersect: false },
      },
      scales: {
        x: {
          grid: { color: grid },
          ticks: { color: titleColor, maxRotation: 45, autoSkip: true, font: { size: 10 } },
        },
        y: {
          grid: { color: grid },
          beginAtZero: true,
          ticks: { color: titleColor },
        },
      },
    };
  }, []);
}

function dualBarDatasets(
  series: DualSeriesChartData,
  baselineLabel: string,
  currentLabel: string,
) {
  return {
    labels: series.labels,
    datasets: [
      {
        label: baselineLabel,
        data: series.baseline,
        backgroundColor: COLOR_BASELINE + 'cc',
        borderColor: COLOR_BASELINE,
        borderWidth: 1,
        borderRadius: 4,
      },
      {
        label: currentLabel,
        data: series.current,
        backgroundColor: COLOR_CURRENT + 'cc',
        borderColor: COLOR_CURRENT,
        borderWidth: 1,
        borderRadius: 4,
      },
    ],
  };
}

function dualLineDatasets(
  series: DualSeriesChartData,
  baselineLabel: string,
  currentLabel: string,
) {
  return {
    labels: series.labels,
    datasets: [
      {
        label: baselineLabel,
        data: series.baseline,
        borderColor: COLOR_BASELINE,
        backgroundColor: COLOR_BASELINE + '22',
        borderWidth: 2,
        pointRadius: series.labels.length <= 31 ? 3 : 1,
        tension: 0.25,
        spanGaps: true,
      },
      {
        label: currentLabel,
        data: series.current,
        borderColor: COLOR_CURRENT,
        backgroundColor: COLOR_CURRENT + '22',
        borderWidth: 2,
        pointRadius: series.labels.length <= 31 ? 3 : 1,
        tension: 0.25,
        spanGaps: true,
      },
    ],
  };
}

function GroupedBarChart({
  series,
  baselineLabel,
  currentLabel,
}: {
  series: DualSeriesChartData;
  baselineLabel: string;
  currentLabel: string;
}) {
  const options = useChartOptions();
  const data = useMemo(
    () => dualBarDatasets(series, baselineLabel, currentLabel),
    [series, baselineLabel, currentLabel],
  );
  return <Bar data={data} options={options} />;
}

function DualLineChart({
  series,
  baselineLabel,
  currentLabel,
}: {
  series: DualSeriesChartData;
  baselineLabel: string;
  currentLabel: string;
}) {
  const options = useChartOptions();
  const data = useMemo(
    () => dualLineDatasets(series, baselineLabel, currentLabel),
    [series, baselineLabel, currentLabel],
  );
  return <Line data={data} options={options} />;
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
        <ChartCard title={vc.chartSiteMetrics} hint={vc.chartLegendHint}>
          <GroupedBarChart
            series={metricsSeries}
            baselineLabel={vc.legendBaseline}
            currentLabel={vc.legendCurrent}
          />
        </ChartCard>
      ) : null}
      {hasStatus && statusSeries ? (
        <ChartCard title={vc.chartStatusMix} hint={vc.chartLegendHint}>
          <GroupedBarChart
            series={statusSeries}
            baselineLabel={vc.legendBaseline}
            currentLabel={vc.legendCurrent}
          />
        </ChartCard>
      ) : null}
      {hasPriority ? (
        <ChartCard title={vc.chartIssuesPriority} hint={vc.chartLegendHint}>
          <GroupedBarChart
            series={prioritySeries}
            baselineLabel={vc.legendBaseline}
            currentLabel={vc.legendCurrent}
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
        <ChartCard title={vc.chartGscClicks} hint={vc.chartDailyHint}>
          <DualLineChart
            series={gscClicks}
            baselineLabel={vc.legendBaseline}
            currentLabel={vc.legendCurrent}
          />
        </ChartCard>
      ) : null}
      {gscImpressions ? (
        <ChartCard title={vc.chartGscImpressions} hint={vc.chartDailyHint}>
          <DualLineChart
            series={gscImpressions}
            baselineLabel={vc.legendBaseline}
            currentLabel={vc.legendCurrent}
          />
        </ChartCard>
      ) : null}
      {ga4Sessions ? (
        <ChartCard title={vc.chartGa4Sessions} hint={vc.chartDailyHint}>
          <DualLineChart
            series={ga4Sessions}
            baselineLabel={vc.legendBaseline}
            currentLabel={vc.legendCurrent}
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
  const options = useChartOptions();
  const data = useMemo(
    () => ({
      labels,
      datasets: [
        {
          label: vc.chartUrlChanges,
          data: values,
          backgroundColor: palette(4),
          borderRadius: 4,
        },
      ],
    }),
    [labels, values, vc.chartUrlChanges],
  );
  const opts = useMemo(
    () => ({
      ...options,
      plugins: { ...options.plugins, legend: { display: false } },
    }),
    [options],
  );

  if (total === 0) return null;

  return (
    <ChartCard title={vc.chartUrlChanges} hint={vc.chartUrlChangesHint}>
      <Bar data={data} options={opts} />
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
    <ChartCard title={vc.chartContent} hint={vc.chartLegendHint}>
      <GroupedBarChart
        series={series}
        baselineLabel={vc.legendBaseline}
        currentLabel={vc.legendCurrent}
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
    <ChartCard title={vc.chartPerformance} hint={vc.chartLegendHint}>
      <GroupedBarChart
        series={series}
        baselineLabel={vc.legendBaseline}
        currentLabel={vc.legendCurrent}
      />
    </ChartCard>
  );
}
