import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend } from 'chart.js';

function cssVar(name, fallback) {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** Grid line color; reads `--chart-grid` from the active theme. */
export function getGridColor() {
  return cssVar('--chart-grid', 'rgba(100, 116, 139, 0.5)');
}

/** Axis / scale title color (theme-aware). */
export function getChartTitleColor() {
  return cssVar('--chart-title', '#64748b');
}

function chartLegendColor() {
  return cssVar('--chart-legend', '#94a3b8');
}

let registered = false;

/** Sync Chart.js default text color with `--app-text` after theme changes. */
export function syncChartJsDefaultsColor() {
  if (typeof document === 'undefined') return;
  const c = getComputedStyle(document.documentElement).getPropertyValue('--app-text').trim();
  if (c && typeof ChartJS !== 'undefined' && ChartJS.defaults) {
    ChartJS.defaults.color = c;
  }
}

/** Register once for Bar/Doughnut charts (Category + Linear scales, Bar + Arc elements). */
export function registerChartJsBase() {
  if (registered) return;
  ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend);
  registered = true;
}

/** Horizontal bar defaults: frequency on X, labels on Y */
export function barOptionsHorizontal(tooltipLabel) {
  const grid = getGridColor();
  const titleColor = getChartTitleColor();
  return {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${ctx.raw?.toLocaleString() ?? ctx.raw}${tooltipLabel ? ` ${tooltipLabel}` : ''}`,
        },
      },
    },
    scales: {
      x: { grid: { color: grid }, beginAtZero: true, title: { display: true, text: 'Count', color: titleColor } },
      y: { grid: { color: grid } },
    },
  };
}

export function doughnutOptionsBottomLegend(tooltipCb) {
  const legendColor = chartLegendColor();
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { color: legendColor, font: { size: 11 }, padding: 12 } },
      tooltip: tooltipCb
        ? { callbacks: tooltipCb }
        : { callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.raw?.toLocaleString()}` } },
    },
  };
}
