'use client';

import { useMemo, type ReactNode } from 'react';
import type { ChartOptions, TooltipItem } from 'chart.js';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, PointElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar, Doughnut, Scatter } from 'react-chartjs-2';
import { palette, sortByValue } from '../../utils/chartPalette';
import {
  registerChartJsBase,
  barOptionsHorizontal,
  getGridColor,
  getChartTitleColor,
  getChartLegendLabelColor,
} from '../../utils/chartJsDefaults';
import { strings } from '../../lib/strings';
import { truncateLabel } from '../google/tableUtils';
import { buildEngagementBuckets } from './ga4TableUtils';
import GoogleChartCard from '../google/GoogleChartCard';
import GoogleTimeSeriesChart from '../google/GoogleTimeSeriesChart';
import type { Ga4ChannelRow, Ga4DailyRow, Ga4DeviceRow, Ga4PageRow, ScatterPoint } from '@/types/components';

registerChartJsBase();
ChartJS.register(ArcElement, PointElement);

const TOP_N = 10;
const SCATTER_MAX = 50;

const ChartCard = GoogleChartCard;

interface TopPagesBySessionsChartProps {
  pages: Ga4PageRow[];
}

export function TopPagesBySessionsChart({ pages }: TopPagesBySessionsChartProps) {
  const tf = strings.views.traffic;
  const chart = useMemo(() => {
    if (!pages?.length) return null;
    const sorted = [...pages].sort((a, b) => (b.sessions || 0) - (a.sessions || 0)).slice(0, TOP_N);
    const labels = sorted.map((r) => truncateLabel(r.path));
    const values = sorted.map((r) => r.sessions || 0);
    const { labels: sortedLabels, values: sortedValues } = sortByValue(labels, values, 'asc');
    return {
      data: {
        labels: sortedLabels,
        datasets: [
          {
            data: sortedValues,
            backgroundColor: palette(sortedLabels.length),
            label: tf.charts.axisSessions,
          },
        ],
      },
    };
  }, [pages, tf]);

  const opts = useMemo(() => barOptionsHorizontal(tf.charts.axisSessions), [tf]);

  if (!chart) {
    return (
      <ChartCard title={tf.charts.topPagesTitle} hint={tf.charts.topPagesHint} ariaLabel={tf.charts.topPagesAria}>
        <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
          {strings.common.notEnoughData}
        </div>
      </ChartCard>
    );
  }

  return (
    <ChartCard title={tf.charts.topPagesTitle} hint={tf.charts.topPagesHint} ariaLabel={tf.charts.topPagesAria}>
      <Bar data={chart.data} options={opts} />
    </ChartCard>
  );
}

interface EngagementDistributionChartProps {
  pages: Ga4PageRow[];
}

export function EngagementDistributionChart({ pages }: EngagementDistributionChartProps) {
  const tf = strings.views.traffic;
  const chart = useMemo(() => {
    const buckets = buildEngagementBuckets(pages);
    if (!buckets.some((n) => n > 0)) return null;
    const labels = tf.charts.engagementBuckets;
    return {
      data: {
        labels,
        datasets: [
          {
            label: tf.charts.axisPages,
            data: buckets,
            backgroundColor: palette(labels.length),
          },
        ],
      },
    };
  }, [pages, tf]);

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
          title: { display: true, text: tf.charts.axisPages, color: titleColor },
        },
      },
    };
  }, [tf]);

  if (!chart) {
    return (
      <ChartCard
        title={tf.charts.engagementTitle}
        hint={tf.charts.engagementHint}
        ariaLabel={tf.charts.engagementAria}
      >
        <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
          {strings.common.notEnoughData}
        </div>
      </ChartCard>
    );
  }

  return (
    <ChartCard title={tf.charts.engagementTitle} hint={tf.charts.engagementHint} ariaLabel={tf.charts.engagementAria}>
      <Bar data={chart.data} options={opts} />
    </ChartCard>
  );
}

interface SessionsEngagementScatterProps {
  rows: Ga4PageRow[];
}

export function SessionsEngagementScatter({ rows }: SessionsEngagementScatterProps) {
  const tf = strings.views.traffic;
  const chart = useMemo(() => {
    const source = (rows || []).slice(0, SCATTER_MAX);
    const points: ScatterPoint[] = source
      .filter((r) => (r.sessions || 0) > 0)
      .map((r) => {
        const rate = parseFloat(String(r.engagementRate));
        const pct = rate <= 1 ? rate * 100 : rate;
        return {
          x: r.sessions ?? 0,
          y: pct,
          path: r.path,
        };
      });
    if (!points.length) return null;
    return {
      datasets: [
        {
          data: points,
          backgroundColor: 'rgba(129, 114, 179, 0.55)',
          borderColor: '#8172B3',
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
              const path = r.path ? truncateLabel(r.path, 36) : '';
              const lines = [
                `${tf.charts.axisSessions}: ${r.x?.toLocaleString()}`,
                `${tf.charts.axisEngagement}: ${r.y?.toFixed(1)}%`,
              ];
              if (path) lines.unshift(path);
              return lines;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: grid },
          beginAtZero: true,
          title: { display: true, text: tf.charts.axisSessions, color: titleColor },
        },
        y: {
          grid: { color: grid },
          beginAtZero: true,
          max: 100,
          title: { display: true, text: tf.charts.axisEngagement, color: titleColor },
        },
      },
    };
  }, [tf]);

  if (!chart) {
    return (
      <ChartCard title={tf.charts.scatterTitle} hint={tf.charts.scatterHint} ariaLabel={tf.charts.scatterAria} heightClass="h-64">
        <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
          {strings.common.notEnoughData}
        </div>
      </ChartCard>
    );
  }

  return (
    <ChartCard title={tf.charts.scatterTitle} hint={tf.charts.scatterHint} ariaLabel={tf.charts.scatterAria} heightClass="h-64">
      <Scatter data={chart} options={opts} />
    </ChartCard>
  );
}

interface Ga4DailyTrendChartProps {
  daily: Ga4DailyRow[];
}

export function Ga4DailyTrendChart({ daily }: Ga4DailyTrendChartProps) {
  const tf = strings.views.traffic;
  const series = [{ key: 'sessions', label: tf.charts.axisSessions }];
  if (!daily?.length) return null;
  return (
    <GoogleChartCard
      title={tf.charts.dailyTitle}
      hint={tf.charts.dailyHint}
      ariaLabel={tf.charts.dailyAria}
      heightClass="h-64"
    >
      <GoogleTimeSeriesChart rows={daily} xKey="date" series={series} yAxisLabel={tf.charts.axisSessions} />
    </GoogleChartCard>
  );
}

interface Ga4ChannelDoughnutProps {
  by_channel: Ga4ChannelRow[];
}

export function Ga4ChannelDoughnut({ by_channel }: Ga4ChannelDoughnutProps) {
  const tf = strings.views.traffic;
  const chart = useMemo(() => {
    if (!by_channel?.length) return null;
    const labels = by_channel.map((r) => r.channel || '(none)');
    const values = by_channel.map((r) => r.sessions || 0);
    if (!values.some((v) => v > 0)) return null;
    return { data: { labels, datasets: [{ data: values, backgroundColor: palette(labels.length) }] } };
  }, [by_channel]);

  const opts = useMemo((): ChartOptions<'doughnut'> => {
    const legendColor = getChartLegendLabelColor();
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: legendColor, font: { size: 11 }, padding: 12 } },
        tooltip: {
          callbacks: {
            label: (ctx: TooltipItem<'doughnut'>) => {
              const raw = ctx.raw;
              const val = typeof raw === 'number' ? raw : Number(raw);
              return ` ${ctx.label}: ${val.toLocaleString()}`;
            },
          },
        },
      },
    };
  }, []);

  if (!chart) return null;
  return (
    <GoogleChartCard title={tf.charts.channelTitle} hint={tf.charts.channelHint} ariaLabel={tf.charts.channelAria} heightClass="h-56">
      <Doughnut data={chart.data} options={opts} />
    </GoogleChartCard>
  );
}

interface Ga4DeviceDoughnutProps {
  by_device: Ga4DeviceRow[];
}

export function Ga4DeviceDoughnut({ by_device }: Ga4DeviceDoughnutProps) {
  const tf = strings.views.traffic;
  const chart = useMemo(() => {
    if (!by_device?.length) return null;
    const labels = by_device.map((r) => r.device || '(none)');
    const values = by_device.map((r) => r.sessions || 0);
    if (!values.some((v) => v > 0)) return null;
    return { data: { labels, datasets: [{ data: values, backgroundColor: palette(labels.length) }] } };
  }, [by_device]);

  const opts = useMemo((): ChartOptions<'doughnut'> => {
    const legendColor = getChartLegendLabelColor();
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: legendColor, font: { size: 11 }, padding: 12 } },
        tooltip: {
          callbacks: {
            label: (ctx: TooltipItem<'doughnut'>) => {
              const raw = ctx.raw;
              const val = typeof raw === 'number' ? raw : Number(raw);
              return ` ${ctx.label}: ${val.toLocaleString()}`;
            },
          },
        },
      },
    };
  }, []);

  if (!chart) return null;
  return (
    <GoogleChartCard title={tf.charts.deviceTitle} hint={tf.charts.deviceHint} ariaLabel={tf.charts.deviceAria} heightClass="h-56">
      <Doughnut data={chart.data} options={opts} />
    </GoogleChartCard>
  );
}
