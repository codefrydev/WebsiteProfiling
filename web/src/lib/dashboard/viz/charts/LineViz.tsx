
import { useMemo } from 'react';
import { DashboardChart } from '@/lib/dashboard/viz/charts/DashboardChart';
import { extractMultiSeries } from '@/lib/dashboard/viz/series';
import { EmptyData } from '@/lib/dashboard/viz/EmptyData';
import type { VizRenderProps } from '@/lib/dashboard/viz/types';

export function LineViz({ widget, data, catalog, opts, onCrossFilter }: VizRenderProps) {
  const ss = useMemo(
    () => extractMultiSeries(widget, data, catalog, opts),
    [widget, data, catalog, opts],
  );
  if (!ss) return <EmptyData />;
  const xField = widget.binding.xField ?? catalog?.fields.find((f) => f.role === 'dimension')?.key ?? '';
  return (
    <DashboardChart
      seriesSet={ss}
      kind="line"
      options={{
        showLegend: opts.showLegend,
        onCategoryClick: onCrossFilter && xField ? (label) => onCrossFilter(xField, label) : undefined,
      }}
    />
  );
}

export function AreaViz({ widget, data, catalog, opts, onCrossFilter }: VizRenderProps) {
  const ss = useMemo(
    () => extractMultiSeries(widget, data, catalog, opts),
    [widget, data, catalog, opts],
  );
  if (!ss) return <EmptyData />;
  const xField = widget.binding.xField ?? catalog?.fields.find((f) => f.role === 'dimension')?.key ?? '';
  return (
    <DashboardChart
      seriesSet={ss}
      kind="area"
      options={{
        showLegend: opts.showLegend,
        onCategoryClick: onCrossFilter && xField ? (label) => onCrossFilter(xField, label) : undefined,
      }}
    />
  );
}
