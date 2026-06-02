import type { TooltipItem } from 'chart.js';

/** Theme-aware Chart.js options — intentionally loose for inline plugin/callback objects. */
export interface ChartOptionsLoose {
  indexAxis?: string;
  responsive?: boolean;
  maintainAspectRatio?: boolean;
  plugins?: {
    legend?: Record<string, unknown>;
    tooltip?: { callbacks?: Record<string, unknown> };
    [key: string]: unknown;
  };
  scales?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Tooltip callback context used in chart option helpers. */
export type ChartTooltipContext = TooltipItem<'bar'>;

export function formatTooltipRaw(ctx: ChartTooltipContext): string {
  const raw = ctx.raw;
  if (typeof raw === 'number') return raw.toLocaleString();
  if (raw == null) return '';
  return String(raw);
}
