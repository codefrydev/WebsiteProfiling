import type { ChartOptions } from 'chart.js';

/** Pass theme-aware Chart.js options without strict plugin typing friction. */
export function looseChartOptions<T extends 'bar' | 'line' | 'doughnut' | 'scatter' | 'pie'>(
  options: ChartOptions<T>,
): ChartOptions<T> {
  return options;
}

/** Use when inline options don't satisfy Chart.js generic plugin types. */
export function anyChartOptions(options: Record<string, unknown>): ChartOptions<'bar'> {
  return options as ChartOptions<'bar'>;
}

export function anyLineOptions(options: Record<string, unknown>): ChartOptions<'line'> {
  return options as ChartOptions<'line'>;
}

export function anyDoughnutOptions(options: Record<string, unknown>): ChartOptions<'doughnut'> {
  return options as ChartOptions<'doughnut'>;
}
