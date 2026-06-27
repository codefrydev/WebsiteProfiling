
import { useMemo } from 'react';
import type { ChartOptions, TooltipItem } from 'chart.js';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar, Scatter } from 'react-chartjs-2';
import { palette, sortByValue } from '../../utils/chartPalette';
import {
  registerChartJsBase,
  barOptionsHorizontal,
  getGridColor,
  getChartTitleColor,
} from '../../utils/chartJsDefaults';
import { strings } from '../../lib/strings';
import { buildPositionBuckets } from './gscTableUtils';
import { truncateLabel } from '../google/tableUtils';
import ChartCard from '../ChartCard';
import GoogleTimeSeriesChart from '../google/GoogleTimeSeriesChart';
import type { GscDailyRow, GscPageRow, GscQueryRow, ScatterPoint } from '@/types/components';

registerChartJsBase();
ChartJS.register(PointElement);

const TOP_N = 10;
const SCATTER_MAX = 50;

function useTopBarChart(
  rows: Array<Record<string, unknown>> | null | undefined,
  labelKey: string,
  valueKey: string,
  sp: typeof strings.views.searchPerformance,
) {
  return useMemo(() => {
    if (!rows?.length) return null;
    const sorted = [...rows]
      .sort((a, b) => Number(b[valueKey] || 0) - Number(a[valueKey] || 0))
      .slice(0, TOP_N);
    const labels = sorted.map((r) => truncateLabel(r[labelKey]));
    const values = sorted.map((r) => Number(r[valueKey] || 0));
    const { labels: sortedLabels, values: sortedValues } = sortByValue(labels, values, 'asc');
    return {
      data: {
        labels: sortedLabels,
        datasets: [
          {
            data: sortedValues,
            backgroundColor: palette(sortedLabels.length),
            label: sp.charts.axisClicks,
          },
        ],
      },
      aria: sp.charts.topQueriesAria,
    };
  }, [rows, labelKey, valueKey, sp]);
}

interface TopQueriesBarChartProps {
  queries: GscQueryRow[];
  devData?: unknown;
}

export function TopQueriesBarChart({ queries, devData }: TopQueriesBarChartProps) {
  const sp = strings.views.searchPerformance;
  const chart = useTopBarChart(queries, 'query', 'clicks', sp);
  const opts = useMemo(() => barOptionsHorizontal(sp.charts.axisClicks), [sp]);

  if (!chart) {
    return (
      <ChartCard title={sp.charts.topQueriesTitle} hint={sp.charts.topQueriesHint} ariaLabel={sp.charts.topQueriesAria} devData={devData}>
        <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
          {strings.common.notEnoughData}
        </div>
      </ChartCard>
    );
  }

  return (
    <ChartCard title={sp.charts.topQueriesTitle} hint={sp.charts.topQueriesHint} ariaLabel={sp.charts.topQueriesAria} devData={devData}>
      <Bar data={chart.data} options={opts} />
    </ChartCard>
  );
}

interface TopPagesBarChartProps {
  pages: GscPageRow[];
  devData?: unknown;
}

export function TopPagesBarChart({ pages, devData }: TopPagesBarChartProps) {
  const sp = strings.views.searchPerformance;
  const chart = useTopBarChart(pages, 'page', 'clicks', sp);
  const opts = useMemo(() => barOptionsHorizontal(sp.charts.axisClicks), [sp]);

  if (!chart) {
    return (
      <ChartCard title={sp.charts.topPagesTitle} hint={sp.charts.topPagesHint} ariaLabel={sp.charts.topPagesAria} devData={devData}>
        <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
          {strings.common.notEnoughData}
        </div>
      </ChartCard>
    );
  }

  return (
    <ChartCard title={sp.charts.topPagesTitle} hint={sp.charts.topPagesHint} ariaLabel={sp.charts.topPagesAria} devData={devData}>
      <Bar data={chart.data} options={opts} />
    </ChartCard>
  );
}

interface PositionDistributionChartProps {
  queries: GscQueryRow[];
  devData?: unknown;
}

export function PositionDistributionChart({ queries, devData }: PositionDistributionChartProps) {
  const sp = strings.views.searchPerformance;
  const chart = useMemo(() => {
    const buckets = buildPositionBuckets(queries);
    if (!buckets.some((n) => n > 0)) return null;
    const labels = sp.charts.positionBuckets;
    return {
      data: {
        labels,
        datasets: [
          {
            label: sp.charts.axisQueries,
            data: buckets,
            backgroundColor: palette(labels.length),
          },
        ],
      },
    };
  }, [queries, sp]);

  const opts = useMemo((): ChartOptions<'bar'> => {
    const grid = getGridColor();
    const titleColor = getChartTitleColor();
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: grid } },
        y: {
          grid: { color: grid },
          beginAtZero: true,
          title: { display: true, text: sp.charts.axisQueries, color: titleColor },
        },
      },
    };
  }, [sp]);

  if (!chart) {
    return (
      <ChartCard title={sp.charts.positionTitle} hint={sp.charts.positionHint} ariaLabel={sp.charts.positionAria} devData={devData}>
        <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
          {strings.common.notEnoughData}
        </div>
      </ChartCard>
    );
  }

  return (
    <ChartCard title={sp.charts.positionTitle} hint={sp.charts.positionHint} ariaLabel={sp.charts.positionAria} devData={devData}>
      <Bar data={chart.data} options={opts} />
    </ChartCard>
  );
}

export { default as UrlCoverageDoughnut } from '../google/UrlCoverageDoughnut';

interface GscDailyTrendChartProps {
  daily: GscDailyRow[];
  devData?: unknown;
}

export function GscDailyTrendChart({ daily, devData }: GscDailyTrendChartProps) {
  const sp = strings.views.searchPerformance;
  const series = [
    { key: 'clicks', label: sp.charts.axisClicks },
    { key: 'impressions', label: sp.charts.axisImpressions },
  ];
  if (!daily?.length) return null;
  return (
    <ChartCard
      title={sp.charts.dailyTitle}
      hint={sp.charts.dailyHint}
      ariaLabel={sp.charts.dailyAria}
      heightClass="h-64"
      devData={devData}
    >
      <GoogleTimeSeriesChart rows={daily} xKey="date" series={series} dualAxis />
    </ChartCard>
  );
}

interface CtrOpportunityScatterProps {
  rows: GscQueryRow[];
  devData?: unknown;
}

export function CtrOpportunityScatter({ rows, devData }: CtrOpportunityScatterProps) {
  const sp = strings.views.searchPerformance;
  const chart = useMemo(() => {
    const source = (rows || []).slice(0, SCATTER_MAX);
    const points: ScatterPoint[] = source
      .filter((r) => (r.impressions ?? 0) > 0)
      .map((r) => ({
        x: r.impressions ?? 0,
        y: parseFloat(String(r.ctr)) || 0,
        query: r.query,
        clicks: r.clicks,
      }));
    if (!points.length) return null;
    return {
      datasets: [
        {
          data: points,
          backgroundColor: 'rgba(76, 114, 176, 0.55)',
          borderColor: '#4C72B0',
          borderWidth: 1,
          pointRadius: 5,
        },
      ],
    };
  }, [rows]);

  const opts = useMemo((): ChartOptions<'scatter'> => {
    const grid = getGridColor();
    const titleColor = getChartTitleColor();
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx: TooltipItem<'scatter'>) => {
              const r = ctx.raw as ScatterPoint;
              const q = r.query ? truncateLabel(r.query, 36) : '';
              const lines = [
                `${sp.charts.axisImpressions}: ${r.x?.toLocaleString()}`,
                `${sp.charts.axisCtr}: ${r.y}%`,
              ];
              if (r.clicks != null) lines.push(`${sp.table.clicks}: ${r.clicks.toLocaleString()}`);
              if (q) lines.unshift(q);
              return lines;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: grid },
          beginAtZero: true,
          title: { display: true, text: sp.charts.axisImpressions, color: titleColor },
        },
        y: {
          grid: { color: grid },
          beginAtZero: true,
          title: { display: true, text: sp.charts.axisCtr, color: titleColor },
        },
      },
    };
  }, [sp]);

  if (!chart) {
    return (
      <ChartCard title={sp.charts.scatterTitle} hint={sp.charts.scatterHint} ariaLabel={sp.charts.scatterAria} heightClass="h-64" devData={devData}>
        <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
          {strings.common.notEnoughData}
        </div>
      </ChartCard>
    );
  }

  return (
    <ChartCard title={sp.charts.scatterTitle} hint={sp.charts.scatterHint} ariaLabel={sp.charts.scatterAria} heightClass="h-64" devData={devData}>
      <Scatter data={chart} options={opts} />
    </ChartCard>
  );
}
