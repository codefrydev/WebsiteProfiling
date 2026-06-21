/** Neutral chart data types, decoupled from Chart.js. */

export interface BarChartSeries {
  /** Series display name — shown in legend / tooltip for grouped charts. */
  label?: string;
  values: number[];
  /** Per-bar colors; falls back to palette if omitted. */
  colors?: string[];
}

export interface BarChartData {
  labels: string[];
  series: BarChartSeries[];
}
