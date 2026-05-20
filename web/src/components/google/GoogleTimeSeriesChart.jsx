'use client';

import { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { palette } from '../../utils/chartPalette';
import { getGridColor, getChartTitleColor, getChartLegendLabelColor } from '../../utils/chartJsDefaults';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

/**
 * Generic time-series line chart backed by an array of daily rows.
 *
 * @param {{ rows: Array<object>, xKey?: string, series: Array<{key: string, label: string}>, yAxisLabel?: string, dualAxis?: boolean }} props
 *   - rows: array of objects each with at least { [xKey]: date_string, ...metrics }
 *   - xKey: field name for x-axis (default 'date')
 *   - series: array of { key, label } describing each line
 *   - dualAxis: when true, series[0] uses y (right) and series[1] uses y1 (left) — useful when scales differ
 */
export default function GoogleTimeSeriesChart({ rows, xKey = 'date', series, yAxisLabel, dualAxis = false }) {
  const { data, options } = useMemo(() => {
    if (!rows?.length || !series?.length) return { data: null, options: null };

    const colors = palette(series.length);
    const labels = rows.map((r) => r[xKey] || '');

    const datasets = series.map((s, i) => ({
      label: s.label,
      data: rows.map((r) => r[s.key] ?? 0),
      borderColor: colors[i],
      backgroundColor: colors[i] + '33',
      fill: false,
      tension: 0.3,
      pointRadius: rows.length <= 35 ? 3 : 1,
      borderWidth: 2,
      ...(dualAxis && i === 0 ? { yAxisID: 'y1' } : {}),
      ...(dualAxis && i > 0 ? { yAxisID: 'y' } : {}),
    }));

    const grid = getGridColor();
    const titleColor = getChartTitleColor();
    const legendColor = getChartLegendLabelColor();

    const scales = dualAxis
      ? {
          x: { grid: { color: grid }, ticks: { maxRotation: 45, autoSkip: true, maxTicksLimit: 10 } },
          y: {
            grid: { color: grid },
            position: 'left',
            title: { display: !!yAxisLabel, text: series[1]?.label || yAxisLabel || '', color: titleColor },
          },
          y1: {
            grid: { drawOnChartArea: false },
            position: 'right',
            title: { display: true, text: series[0]?.label || '', color: titleColor },
          },
        }
      : {
          x: { grid: { color: grid }, ticks: { maxRotation: 45, autoSkip: true, maxTicksLimit: 10 } },
          y: {
            grid: { color: grid },
            beginAtZero: true,
            title: { display: !!yAxisLabel, text: yAxisLabel || '', color: titleColor },
          },
        };

    return {
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: series.length > 1,
            labels: { color: legendColor, font: { size: 11 }, padding: 10 },
          },
          tooltip: { mode: 'index', intersect: false },
        },
        scales,
      },
    };
  }, [rows, xKey, series, yAxisLabel, dualAxis]);

  if (!data) return null;
  return <Line data={data} options={options} />;
}
