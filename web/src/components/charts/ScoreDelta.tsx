'use client';

import { Minus, TrendingDown, TrendingUp } from 'lucide-react';

export interface ScoreDeltaProps {
  delta: number | null | undefined;
}

export function ScoreDelta({ delta }: ScoreDeltaProps) {
  if (delta == null || delta === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" /> 0
      </span>
    );
  }
  const up = delta > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  const color = up ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400';
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${color}`}>
      <Icon className="h-3 w-3" />
      {up ? '+' : ''}
      {delta}
    </span>
  );
}
