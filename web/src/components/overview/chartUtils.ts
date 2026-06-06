import type { TooltipItem } from 'chart.js';
import { strings, format } from '@/lib/strings';
import {
  getGridColor,
  getChartTitleColor,
  getChartLegendLabelColor,
} from '@/utils/chartJsDefaults';

export function sumObject(obj: Record<string, unknown> | null | undefined): number {
  if (!obj || typeof obj !== 'object') return 0;
  return Object.values(obj).reduce<number>((a, v) => a + Number(v ?? 0), 0);
}

export function barOptsVertical(yTitle: string, ariaDescription?: string) {
  const o = strings.views.overview;
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<'bar'>) =>
            ` ${format(o.tooltipCountBar, { count: Number(ctx.raw).toLocaleString() })}`,
        },
      },
    },
    scales: {
      x: { grid: { color: getGridColor() } },
      y: {
        grid: { color: getGridColor() },
        beginAtZero: true,
        title: { display: true, text: yTitle, color: getChartTitleColor() },
      },
    },
    ...(ariaDescription ? { aria: { description: ariaDescription } } : {}),
  };
}

export function barOptsGrouped(yTitle: string) {
  const o = strings.views.overview;
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: { color: getChartLegendLabelColor(), font: { size: 11 }, padding: 10 },
      },
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<'bar'>) =>
            ` ${format(o.tooltipGroupedBar, {
              dataset: ctx.dataset.label,
              count: Number(ctx.raw).toLocaleString(),
            })}`,
        },
      },
    },
    scales: {
      x: { grid: { color: getGridColor() } },
      y: {
        grid: { color: getGridColor() },
        beginAtZero: true,
        title: { display: true, text: yTitle, color: getChartTitleColor() },
      },
    },
  };
}

export function barOptsSocial() {
  const o = strings.views.overview;
  const pct = strings.common.percentOfPages;
  return {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<'bar'>) =>
            ` ${format(o.socialTooltipHtml, { label: ctx.label, pct: Number(ctx.raw).toFixed(1) })}`,
        },
      },
    },
    scales: {
      x: {
        grid: { color: getGridColor() },
        beginAtZero: true,
        max: 100,
        title: { display: true, text: pct, color: getChartTitleColor() },
      },
      y: { grid: { color: getGridColor() } },
    },
  };
}

export function barOptsLighthouse() {
  const o = strings.views.overview;
  const scoreLbl = strings.common.score;
  return {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<'bar'>) => {
            const v = ctx.raw;
            return v == null ? ` ${o.lhTooltipNoScore}` : ` ${format(o.lhTooltipScore, { score: Number(v) })}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: { color: getGridColor() },
        beginAtZero: true,
        max: 100,
        title: { display: true, text: scoreLbl, color: getChartTitleColor() },
      },
      y: { grid: { color: getGridColor() } },
    },
  };
}
