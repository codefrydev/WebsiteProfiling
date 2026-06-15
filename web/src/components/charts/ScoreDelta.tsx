'use client';

import { Minus, TrendingDown, TrendingUp } from 'lucide-react';

export interface ScoreDeltaProps {
  delta: number | null | undefined;
  /** When false, a negative delta is good (e.g. LCP, response time). Default true. */
  higherIsBetter?: boolean;
}

export function isNeutralScoreDelta(delta: number | null | undefined): boolean {
  return delta == null || delta === 0 || !Number.isFinite(delta);
}

export function isDisplayableScoreDelta(
  delta: number | null | undefined,
): delta is number {
  return delta != null && delta !== 0 && Number.isFinite(delta);
}

export function isImprovedScoreDelta(delta: number, higherIsBetter = true): boolean {
  return higherIsBetter ? delta > 0 : delta < 0;
}

export function ScoreDelta({ delta, higherIsBetter = true }: ScoreDeltaProps) {
  if (!isDisplayableScoreDelta(delta)) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" /> 0
      </span>
    );
  }
  const value = delta;
  const improved = isImprovedScoreDelta(value, higherIsBetter);
  const Icon = value > 0 ? TrendingUp : TrendingDown;
  const color = improved
    ? 'text-emerald-700 dark:text-emerald-400'
    : 'text-rose-700 dark:text-rose-400';
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${color}`}>
      <Icon className="h-3 w-3" />
      {value > 0 ? '+' : ''}
      {value}
    </span>
  );
}
