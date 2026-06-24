
import { useMemo } from 'react';
import { DashboardChart } from '@/lib/dashboard/viz/charts/DashboardChart';
import { extractMultiSeries } from '@/lib/dashboard/viz/series';
import { EmptyData } from '@/lib/dashboard/viz/EmptyData';
import { CompactStackedBar } from '@/components/charts/compact/CompactStackedBar';
import { palette } from '@/utils/chartPalette';
import type { VizRenderProps } from '@/lib/dashboard/viz/types';

export function PieViz({ widget, data, catalog, opts, onCrossFilter }: VizRenderProps) {
  const ss = useMemo(
    () => extractMultiSeries(widget, data, catalog, opts),
    [widget, data, catalog, opts],
  );
  if (!ss) return <EmptyData />;
  const xField = widget.binding.xField ?? catalog?.fields.find((f) => f.role === 'dimension')?.key ?? '';
  return (
    <DashboardChart
      seriesSet={ss}
      kind="pie"
      options={{
        onCategoryClick: onCrossFilter && xField ? (label) => onCrossFilter(xField, label) : undefined,
      }}
    />
  );
}

export function DoughnutViz({ widget, data, catalog, opts, onCrossFilter }: VizRenderProps) {
  const ss = useMemo(
    () => extractMultiSeries(widget, data, catalog, opts),
    [widget, data, catalog, opts],
  );
  if (!ss) return <EmptyData />;
  const xField = widget.binding.xField ?? catalog?.fields.find((f) => f.role === 'dimension')?.key ?? '';
  return (
    <DashboardChart
      seriesSet={ss}
      kind="doughnut"
      options={{
        onCategoryClick: onCrossFilter && xField ? (label) => onCrossFilter(xField, label) : undefined,
      }}
    />
  );
}

export function StackedBarViz({ widget, data, catalog, opts, onCrossFilter }: VizRenderProps) {
  const ss = useMemo(
    () => extractMultiSeries(widget, data, catalog, opts),
    [widget, data, catalog, opts],
  );
  if (!ss) return <EmptyData />;

  // For compact stacked-bar: use first series values mapped over labels as segments
  const xField = widget.binding.xField ?? catalog?.fields.find((f) => f.role === 'dimension')?.key ?? '';
  const colors = palette(ss.labels.length);
  const segments = ss.labels.map((label, i) => ({
    label,
    value: ss.series[0]?.values[i] ?? 0,
    color: colors[i],
  }));

  return (
    <div
      className="py-3 px-1 cursor-pointer"
      onClick={() => {
        // Stacked bar is a summary — clicking it has no specific category
      }}
    >
      <CompactStackedBar segments={segments} />
      {onCrossFilter && xField && (
        <div className="mt-2 flex flex-wrap gap-1">
          {ss.labels.map((label, i) => (
            <button
              key={label}
              onClick={() => onCrossFilter(xField, label)}
              className="text-[10px] px-1.5 py-0.5 rounded border border-default hover:border-blue-500/50 text-muted-foreground hover:text-bright transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
