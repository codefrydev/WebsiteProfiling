'use client';

import { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { palette } from '@/utils/chartPalette';
import { getGridColor, getChartTitleColor, getChartLegendLabelColor } from '@/utils/chartJsDefaults';
import { ChartPanel } from '@/components/charts/ChartPanel';
import { extractChartSeries } from '@/lib/dashboard/viz/series';
import { EmptyData } from '@/lib/dashboard/viz/EmptyData';
import type { VizRenderProps } from '@/lib/dashboard/viz/types';

let lineRegistered = false;
function registerLineChart() {
  if (lineRegistered) return;
  ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Title, Tooltip, Legend);
  lineRegistered = true;
}

function useLineChartData(props: VizRenderProps, filled: boolean) {
  return useMemo(() => {
    registerLineChart();
    const series = extractChartSeries(props.widget, props.data, props.catalog, props.opts);
    if (!series) return null;
    const color = palette(1)[0];
    return {
      data: {
        labels: series.labels,
        datasets: [{
          label: props.widget.title,
          data: series.values,
          borderColor: color,
          backgroundColor: filled ? `${color}33` : 'transparent',
          fill: filled,
          tension: 0.35,
          pointRadius: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: props.opts.showLegend ?? false, labels: { color: getChartLegendLabelColor() } },
        },
        scales: {
          x: { grid: { color: getGridColor() }, ticks: { color: getChartTitleColor(), maxRotation: 45 } },
          y: { grid: { color: getGridColor() }, ticks: { color: getChartTitleColor() } },
        },
      },
    };
  }, [props, filled]);
}

export function LineViz(props: VizRenderProps) {
  const chart = useLineChartData(props, false);
  if (!chart) return <EmptyData />;
  return (
    <ChartPanel heightClass="h-44">
      <Line data={chart.data} options={chart.options} />
    </ChartPanel>
  );
}

export function AreaViz(props: VizRenderProps) {
  const chart = useLineChartData(props, true);
  if (!chart) return <EmptyData />;
  return (
    <ChartPanel heightClass="h-44">
      <Line data={chart.data} options={chart.options} />
    </ChartPanel>
  );
}
