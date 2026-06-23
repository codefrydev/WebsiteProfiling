'use client';

import { formatValue, thresholdColor } from '@/lib/dashboard/viz/formatters';
import type { VizRenderProps } from '@/lib/dashboard/viz/types';

export function KpiViz({ data, opts }: VizRenderProps) {
  const color = thresholdColor(data.kpiValue, opts.thresholds);
  return (
    <div className="flex flex-col justify-center py-1">
      <p className="text-3xl font-bold tabular-nums" style={color ? { color } : undefined}>
        {formatValue(data.kpiValue, opts.format)}
      </p>
    </div>
  );
}

export function StatCardViz({ data, opts }: VizRenderProps) {
  const color = thresholdColor(data.kpiValue, opts.thresholds);
  return (
    <div className="rounded-lg border border-default/80 bg-brand-900/50 px-3 py-2 h-full flex flex-col justify-center">
      <p className="text-2xl font-bold tabular-nums" style={color ? { color } : undefined}>
        {formatValue(data.kpiValue, opts.format)}
      </p>
      {opts.subtitle ? (
        <p className="text-xs text-muted-foreground mt-1 truncate">{opts.subtitle}</p>
      ) : null}
    </div>
  );
}
