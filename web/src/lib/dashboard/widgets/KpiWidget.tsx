
import type { QueryResult } from '@/lib/dashboard/engine/types';
import type { VizOptions } from '@/lib/dashboard/engine/doc';
import { formatValue, thresholdColor } from '@/lib/dashboard/charts/format';

interface KpiWidgetProps {
  result: QueryResult;
  options?: VizOptions;
  variant?: 'kpi' | 'stat-card';
}

export function KpiWidget({ result, options, variant = 'kpi' }: KpiWidgetProps) {
  const value = result.scalar;
  const label = result.series[0]?.label;
  const color = thresholdColor(value, options?.thresholds);
  return (
    <div className="flex flex-col justify-center h-full px-1">
      <div
        className="font-bold leading-none tracking-tight text-bright"
        style={{ color, fontSize: variant === 'stat-card' ? '1.75rem' : '2.5rem' }}
      >
        {formatValue(value, options?.format)}
      </div>
      {(options?.subtitle || (variant === 'stat-card' && label)) && (
        <div className="mt-1 text-xs text-muted-foreground truncate">
          {options?.subtitle ?? label}
        </div>
      )}
    </div>
  );
}
