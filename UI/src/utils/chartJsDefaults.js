import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend } from 'chart.js';

export const GRID_COLOR = 'rgba(71, 85, 105, 0.5)';

let registered = false;

/** Register once for Bar/Doughnut charts (Category + Linear scales, Bar + Arc elements). */
export function registerChartJsBase() {
  if (registered) return;
  ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend);
  registered = true;
}

/** Horizontal bar defaults: frequency on X, labels on Y */
export function barOptionsHorizontal(tooltipLabel) {
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
      x: { grid: { color: GRID_COLOR }, beginAtZero: true, title: { display: true, text: 'Count', color: '#64748b' } },
      y: { grid: { color: GRID_COLOR } },
    },
  };
}

export function doughnutOptionsBottomLegend(tooltipCb) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 11 }, padding: 12 } },
      tooltip: tooltipCb
        ? { callbacks: tooltipCb }
        : { callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.raw?.toLocaleString()}` } },
    },
  };
}
