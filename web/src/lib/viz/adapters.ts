/**
 * Adapters that bridge Chart.js ChartData shapes to neutral BarChartData,
 * allowing incremental migration without rewriting data-prep hooks first.
 */
import type { ChartData } from 'chart.js';
import type { BarChartData } from './types';
import type { DualSeriesChartData } from '@/lib/compareChartData';

const COMPARE_COLOR_BASELINE = '#94a3b8';
const COMPARE_COLOR_CURRENT = '#3b82f6';

export function chartDataToBarChartData(data: ChartData<'bar'>): BarChartData {
  const labels = (data.labels ?? []).map(String);
  const series = (data.datasets ?? []).map((ds) => ({
    label: typeof ds.label === 'string' ? ds.label : undefined,
    values: (ds.data as number[]).map(Number),
    colors: Array.isArray(ds.backgroundColor)
      ? (ds.backgroundColor as string[])
      : typeof ds.backgroundColor === 'string'
        ? labels.map(() => ds.backgroundColor as string)
        : undefined,
  }));
  return { labels, series };
}

/**
 * Convert a Compare page DualSeriesChartData (baseline + current) to neutral
 * BarChartData for use with D3GroupedBarChart.
 * Null values are coalesced to 0 for bar height; use D3DualLineChart for gap-aware lines.
 */
export function dualSeriesToBarChartData(
  series: DualSeriesChartData,
  baselineLabel: string,
  currentLabel: string,
  colors?: { baseline?: string; current?: string },
): BarChartData {
  const baseColor = colors?.baseline ?? COMPARE_COLOR_BASELINE;
  const curColor = colors?.current ?? COMPARE_COLOR_CURRENT;
  return {
    labels: series.labels,
    series: [
      {
        label: baselineLabel,
        values: series.baseline.map((v) => v ?? 0),
        colors: series.labels.map(() => baseColor),
      },
      {
        label: currentLabel,
        values: series.current.map((v) => v ?? 0),
        colors: series.labels.map(() => curColor),
      },
    ],
  };
}

/** Build a single-series BarChartData from labels, values, and optional per-bar colors. */
export function labelsValuesToBarChartData(
  labels: string[],
  values: number[],
  colors?: string[] | string,
): BarChartData {
  const colorArr =
    typeof colors === 'string'
      ? labels.map(() => colors)
      : colors;
  return {
    labels,
    series: [{ values, colors: colorArr }],
  };
}

/** Build a multi-series grouped BarChartData. */
export function groupedBarChartData(
  labels: string[],
  datasets: Array<{ label: string; values: number[]; colors?: string[] | string }>,
): BarChartData {
  return {
    labels,
    series: datasets.map((ds) => ({
      label: ds.label,
      values: ds.values,
      colors:
        typeof ds.colors === 'string'
          ? labels.map(() => ds.colors as string)
          : ds.colors,
    })),
  };
}
