'use client';

import { AlertTriangle } from 'lucide-react';
import ChartRenderer from '@/lib/dashboard/charts/ChartRenderer';
import { isEChartsViz } from '@/lib/dashboard/charts/optionBuilders';
import { KpiWidget } from '@/lib/dashboard/widgets/KpiWidget';
import { TableWidget } from '@/lib/dashboard/widgets/TableWidget';
import { TextWidget } from '@/lib/dashboard/widgets/TextWidget';
import { Skeleton } from '@/components/Skeleton';
import type { Widget } from '@/lib/dashboard/engine/doc';
import type { QueryResult } from '@/lib/dashboard/engine/types';
import type { WidgetStatus } from '@/lib/dashboard/hooks/useWidgetQuery';
import type { EChartsInstance } from '@/lib/dashboard/charts/echartsCore';

interface WidgetBodyProps {
  widget: Widget;
  result: QueryResult;
  status: WidgetStatus;
  onSelect?: (category: string, seriesKey?: string) => void;
  onChartReady?: (chart: EChartsInstance) => void;
}

export function WidgetBody({ widget, result, status, onSelect, onChartReady }: WidgetBodyProps) {
  if (widget.viz === 'text') return <TextWidget options={widget.vizOptions} />;

  if (status === 'loading') {
    return (
      <div className="space-y-2 p-1">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="flex items-center gap-1.5 text-amber-500 text-xs p-2">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        This dataset isn’t available for the current report.
      </div>
    );
  }

  if (widget.viz === 'kpi' || widget.viz === 'stat-card') {
    return <KpiWidget result={result} options={widget.vizOptions} variant={widget.viz} />;
  }
  if (widget.viz === 'table') {
    return <TableWidget result={result} options={widget.vizOptions} />;
  }

  const empty = result.categories.length === 0 && result.series.every((s) => s.values.length === 0);
  if (empty || !isEChartsViz(widget.viz)) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
        No data for this configuration
      </div>
    );
  }
  return (
    <ChartRenderer
      viz={widget.viz}
      result={result}
      options={widget.vizOptions}
      onSelect={onSelect}
      onReady={onChartReady}
    />
  );
}
