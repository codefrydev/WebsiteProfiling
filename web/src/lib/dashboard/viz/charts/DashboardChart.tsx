
/**
 * Shared chart component for all dashboard chart visualizations.
 * Accepts a normalized SeriesSet and renders the correct Chart.js chart with
 * N datasets, palette per series, and shared theme defaults.
 */

import { useMemo, useCallback } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Filler,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Line, Pie, Doughnut } from 'react-chartjs-2';
import type { ChartEvent } from 'chart.js';
import { palette } from '@/utils/chartPalette';
import {
  getGridColor,
  getChartTitleColor,
  getChartLegendLabelColor,
  doughnutOptionsBottomLegend,
} from '@/utils/chartJsDefaults';
import { anyDoughnutOptions } from '@/utils/chartOptions';
import { ChartPanel } from '@/components/charts/ChartPanel';
import type { SeriesSet } from '@/lib/dashboard/viz/series';

let _registered = false;
function registerAll() {
  if (_registered) return;
  ChartJS.register(
    CategoryScale, LinearScale, BarElement, PointElement,
    LineElement, ArcElement, Filler, Title, Tooltip, Legend,
  );
  _registered = true;
}

export type ChartKind = 'bar' | 'horizontal-bar' | 'line' | 'area' | 'pie' | 'doughnut';

export interface DashboardChartOptions {
  stacked?: boolean;
  showLegend?: boolean;
  heightClass?: string;
  /** If provided, onClick resolves the clicked category label and calls this. */
  onCategoryClick?: (label: string) => void;
}

interface DashboardChartProps {
  seriesSet: SeriesSet;
  kind: ChartKind;
  options?: DashboardChartOptions;
}

export function DashboardChart({ seriesSet, kind, options = {} }: DashboardChartProps) {
  registerAll();

  const { stacked = seriesSet.stacked, showLegend = false, heightClass = 'h-44', onCategoryClick } = options;
  const colors = palette(Math.max(seriesSet.series.length, seriesSet.labels.length));

  const handleClick = useCallback(
    (event: ChartEvent, elements: { index: number }[]) => {
      if (!onCategoryClick || !elements.length) return;
      const idx = elements[0]?.index ?? -1;
      if (idx >= 0 && idx < seriesSet.labels.length) {
        onCategoryClick(seriesSet.labels[idx]);
      }
    },
    [onCategoryClick, seriesSet.labels],
  );

  const grid = getGridColor();
  const tickColor = getChartTitleColor();
  const legendColor = getChartLegendLabelColor();

  const datasets = useMemo(() => {
    if (kind === 'pie' || kind === 'doughnut') {
      // Pie/Doughnut: one dataset, one color per label
      const s0 = seriesSet.series[0];
      if (!s0) return [];
      return [{ data: s0.values, backgroundColor: colors, borderWidth: 0 }];
    }
    return seriesSet.series.map((s, i) => {
      const color = colors[i % colors.length];
      if (kind === 'line' || kind === 'area') {
        return {
          label: s.label,
          data: s.values,
          borderColor: color,
          backgroundColor: kind === 'area' ? `${color}33` : 'transparent',
          fill: kind === 'area',
          tension: 0.35,
          pointRadius: 2,
        };
      }
      return {
        label: s.label,
        data: s.values,
        backgroundColor: color,
        borderRadius: 3,
      };
    });
  }, [seriesSet.series, colors, kind]);

  // Pie / Doughnut
  if (kind === 'pie' || kind === 'doughnut') {
    const pieData = {
      labels: seriesSet.labels,
      datasets,
    };
    const pieOpts = anyDoughnutOptions({
      ...doughnutOptionsBottomLegend(),
      onClick: onCategoryClick ? handleClick : undefined,
    });
    return (
      <div className={heightClass}>
        {kind === 'doughnut'
          ? <Doughnut data={pieData} options={pieOpts} />
          : <Pie data={pieData} options={pieOpts} />}
      </div>
    );
  }

  // Bar / Line / Area
  const chartData = {
    labels: seriesSet.labels,
    datasets,
  };

  const isHorizontal = kind === 'horizontal-bar';
  const baseScales = isHorizontal
    ? {
        x: { stacked, beginAtZero: true, grid: { color: grid }, ticks: { color: tickColor } },
        y: { stacked, grid: { color: grid }, ticks: { color: tickColor, maxRotation: 0 } },
      }
    : {
        x: { stacked, grid: { color: grid }, ticks: { color: tickColor, maxRotation: 45 } },
        y: { stacked, beginAtZero: true, grid: { color: grid }, ticks: { color: tickColor } },
      };

  const chartOpts = {
    indexAxis: isHorizontal ? ('y' as const) : ('x' as const),
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: showLegend || seriesSet.series.length > 1,
        labels: { color: legendColor, font: { size: 11 }, padding: 10 },
      },
    },
    scales: baseScales,
    onClick: onCategoryClick ? handleClick : undefined,
  };

  if (kind === 'line' || kind === 'area') {
    return (
      <ChartPanel heightClass={heightClass}>
        <Line data={chartData} options={chartOpts} />
      </ChartPanel>
    );
  }

  return (
    <ChartPanel heightClass={heightClass}>
      <Bar data={chartData} options={chartOpts} />
    </ChartPanel>
  );
}
