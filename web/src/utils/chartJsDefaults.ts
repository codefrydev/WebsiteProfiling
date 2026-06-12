import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend } from 'chart.js';
import type { ChartOptionsLoose, ChartTooltipContext } from '@/types/chart';
import { formatTooltipRaw } from '@/types/chart';

function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** Grid line color; reads `--chart-grid` from the active theme. */
export function getGridColor(): string {
  return cssVar('--chart-grid', 'rgba(100, 116, 139, 0.5)');
}

/** Axis / scale title color (theme-aware). */
export function getChartTitleColor(): string {
  return cssVar('--chart-title', '#64748b');
}

/** Legend label color for Chart.js plugins (theme-aware). */
export function getChartLegendLabelColor(): string {
  return cssVar('--chart-legend', '#94a3b8');
}

/** @deprecated Same as {@link getChartLegendLabelColor}; kept so stale bundles or imports do not throw. */
export const chartLegendColor = getChartLegendLabelColor;

/** Canvas `fillStyle` for custom Chart.js plugins — matches body text (`--app-text`). */
export function getChartCanvasTextColor(): string {
  return cssVar('--app-text', '#334155');
}

let registered = false;

/** Sync Chart.js default text color with `--app-text` after theme changes. */
export function syncChartJsDefaultsColor(): void {
  if (typeof document === 'undefined') return;
  const c = getComputedStyle(document.documentElement).getPropertyValue('--app-text').trim();
  if (c && typeof ChartJS !== 'undefined' && ChartJS.defaults) {
    ChartJS.defaults.color = c;
  }
}

/** Register once for Bar/Doughnut charts (Category + Linear scales, Bar + Arc elements). */
export function registerChartJsBase(): void {
  if (registered) return;
  ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend);
  registered = true;
}

/** Truncate long axis labels so horizontal bar charts do not widen the page. */
export function truncateChartLabel(label: string, maxLength = 28): string {
  if (label.length <= maxLength) return label;
  return `${label.slice(0, Math.max(1, maxLength - 1))}…`;
}

/** Horizontal bar defaults: frequency on X, labels on Y */
export function barOptionsHorizontal(
  tooltipLabel?: string,
  yAxisLabels?: readonly string[],
  maxLabelLength = 28,
): ChartOptionsLoose {
  const grid = getGridColor();
  const titleColor = getChartTitleColor();
  const yScale: Record<string, unknown> = { grid: { color: grid } };
  if (yAxisLabels?.length) {
    yScale.ticks = {
      callback: (_value: unknown, index: number) => {
        const label = yAxisLabels[index];
        return label ? truncateChartLabel(String(label), maxLabelLength) : '';
      },
    };
  }
  return {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: ChartTooltipContext) =>
            ` ${formatTooltipRaw(ctx)}${tooltipLabel ? ` ${tooltipLabel}` : ''}`,
        },
      },
    },
    scales: {
      x: { grid: { color: grid }, beginAtZero: true, title: { display: true, text: 'Count', color: titleColor } },
      y: yScale,
    },
  };
}

export function doughnutOptionsBottomLegend(
  tooltipCb?: { callbacks: Record<string, unknown> },
): ChartOptionsLoose {
  const legendColor = chartLegendColor();
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { color: legendColor, font: { size: 11 }, padding: 12 } },
      tooltip: tooltipCb
        ? { callbacks: tooltipCb }
        : { callbacks: { label: (ctx: ChartTooltipContext) => ` ${ctx.label}: ${formatTooltipRaw(ctx)}` } },
    },
  };
}

/** Cast theme helpers for inline Chart.js option objects. */
export function chartOptions<T extends ChartOptionsLoose>(opts: T): T {
  return opts;
}
