
import { useMemo } from 'react';
import { DashboardChart } from '@/lib/dashboard/viz/charts/DashboardChart';
import { extractMultiSeries } from '@/lib/dashboard/viz/series';
import { EmptyData } from '@/lib/dashboard/viz/EmptyData';
import type { VizRenderProps } from '@/lib/dashboard/viz/types';

export function BarViz({ widget, data, catalog, opts, onCrossFilter }: VizRenderProps) {
  const ss = useMemo(
    () => extractMultiSeries(widget, data, catalog, opts),
    [widget, data, catalog, opts],
  );
  if (!ss) return <EmptyData />;
  const xField = widget.binding.xField ?? catalog?.fields.find((f) => f.role === 'dimension')?.key ?? '';
  return (
    <DashboardChart
      seriesSet={ss}
      kind="bar"
      options={{
        showLegend: opts.showLegend,
        onCategoryClick: onCrossFilter && xField ? (label) => onCrossFilter(xField, label) : undefined,
      }}
    />
  );
}

export function HorizontalBarViz({ widget, data, catalog, opts, onCrossFilter }: VizRenderProps) {
  const ss = useMemo(
    () => extractMultiSeries(widget, data, catalog, opts),
    [widget, data, catalog, opts],
  );
  if (!ss) return <EmptyData />;
  const xField = widget.binding.xField ?? catalog?.fields.find((f) => f.role === 'dimension')?.key ?? '';
  return (
    <DashboardChart
      seriesSet={ss}
      kind="horizontal-bar"
      options={{
        showLegend: opts.showLegend,
        onCategoryClick: onCrossFilter && xField ? (label) => onCrossFilter(xField, label) : undefined,
      }}
    />
  );
}

export function RankedBarViz({ widget, data, catalog, opts, onCrossFilter }: VizRenderProps) {
  const mergedOpts = { ...opts, chartSort: opts.chartSort ?? 'desc' as const };
  const ss = useMemo(
    () => extractMultiSeries(widget, data, catalog, mergedOpts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [widget, data, catalog, opts],
  );
  if (!ss) return <EmptyData />;
  const xField = widget.binding.xField ?? catalog?.fields.find((f) => f.role === 'dimension')?.key ?? '';
  return (
    <DashboardChart
      seriesSet={ss}
      kind="horizontal-bar"
      options={{
        heightClass: 'h-44',
        onCategoryClick: onCrossFilter && xField ? (label) => onCrossFilter(xField, label) : undefined,
      }}
    />
  );
}
