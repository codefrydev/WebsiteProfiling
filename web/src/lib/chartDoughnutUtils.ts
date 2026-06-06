import { doughnutOptionsBottomLegend } from '@/utils/chartJsDefaults';
import type { ChartOptionsLoose } from '@/types/chart';

export interface SliceData {
  labels: string[];
  values: number[];
}

/** Remove zero-count slices before rendering doughnuts. */
export function filterZeroSlices(labels: string[], values: number[]): SliceData {
  const outLabels: string[] = [];
  const outValues: number[] = [];
  labels.forEach((label, i) => {
    const n = Number(values[i] ?? 0);
    if (n > 0) {
      outLabels.push(label);
      outValues.push(n);
    }
  });
  return { labels: outLabels, values: outValues };
}

export function sliceTotal(values: number[]): number {
  return values.reduce((sum, v) => sum + Number(v || 0), 0);
}

export function slicePercent(value: number, total: number): number {
  if (total <= 0) return 0;
  return (100 * value) / total;
}

/** Plain-language summary for aria / sr-only text. */
export function formatCompositionAria(labels: string[], values: number[], unit = 'items'): string {
  const total = sliceTotal(values);
  if (total <= 0) return 'No data.';
  return labels
    .map((label, i) => {
      const n = Number(values[i] ?? 0);
      const pct = slicePercent(n, total).toFixed(1);
      return `${label}: ${n.toLocaleString()} (${pct}% of ${total.toLocaleString()} ${unit})`;
    })
    .join('; ');
}

export function doughnutOptionsWithPercentTooltip(
  extra?: Partial<ChartOptionsLoose>,
): ChartOptionsLoose {
  const base = doughnutOptionsBottomLegend({
    callbacks: {
      label: (ctx: { label?: string; raw?: unknown; dataset?: { data?: unknown[] } }) => {
        const raw = Number(ctx.raw ?? 0);
        const data = (ctx.dataset?.data as number[]) ?? [];
        const total = sliceTotal(data);
        const pct = slicePercent(raw, total).toFixed(1);
        return ` ${ctx.label}: ${raw.toLocaleString()} (${pct}%)`;
      },
    },
  });
  return { ...base, ...extra, plugins: { ...base.plugins, ...extra?.plugins } };
}
