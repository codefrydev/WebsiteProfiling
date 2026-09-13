
import type { ReactNode } from 'react';
import { scaleLinear } from 'd3-scale';

export interface RelativeMetricBarProps {
  /** 0–100 width for the bar */
  pct: number;
  value: ReactNode;
  valueClassName?: string;
  barClassName?: string;
  title?: string;
}

const widthScale = scaleLinear().domain([0, 100]).range([0, 100]).clamp(true);

/**
 * Compact relative-strength bar + value (Overview importance, etc.).
 * Bar width is computed with d3-scale for consistency with other viz components.
 */
export default function RelativeMetricBar({
  pct,
  value,
  valueClassName = 'text-md-sys-on-surface font-medium',
  barClassName = 'bg-md-sys-outline/70',
  title,
}: RelativeMetricBarProps) {
  const widthPct = widthScale(pct);

  return (
    <div className="flex w-full min-w-0 flex-col items-stretch gap-1.5 sm:flex-row sm:items-center sm:justify-end sm:gap-2">
      <div className="order-2 sm:order-1 min-w-0 flex-1 max-w-[5rem] bg-md-sys-surface-container-highest/40 rounded-full h-1.5 hidden sm:block overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barClassName}`}
          style={{ width: `${widthPct}%` }}
        />
      </div>
      <span className={`order-1 sm:order-2 shrink-0 text-sm tabular-nums ${valueClassName}`} title={title}>
        {value}
      </span>
    </div>
  );
}
