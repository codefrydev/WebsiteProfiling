'use client';

import { useMemo } from 'react';
import { SimpleBarChart } from '@/components/charts/SimpleBarChart';
import { extractChartSeries } from '@/lib/dashboard/viz/series';
import { EmptyData } from '@/lib/dashboard/viz/EmptyData';
import type { VizRenderProps } from '@/lib/dashboard/viz/types';

export function BarViz(props: VizRenderProps) {
  const series = extractChartSeries(props.widget, props.data, props.catalog, props.opts);
  if (!series) return <EmptyData />;
  return <SimpleBarChart labels={series.labels} values={series.values} horizontal={false} heightClass="h-40" />;
}

export function HorizontalBarViz(props: VizRenderProps) {
  const series = extractChartSeries(props.widget, props.data, props.catalog, props.opts);
  if (!series) return <EmptyData />;
  return <SimpleBarChart labels={series.labels} values={series.values} horizontal heightClass="h-40" />;
}

export function RankedBarViz(props: VizRenderProps) {
  const series = useMemo(
    () => extractChartSeries(
      { ...props.widget, options: { ...props.opts, chartSort: props.opts.chartSort ?? 'desc' } },
      props.data,
      props.catalog,
      { ...props.opts, chartSort: props.opts.chartSort ?? 'desc' },
    ),
    [props.widget, props.data, props.catalog, props.opts],
  );
  if (!series) return <EmptyData />;
  return (
    <SimpleBarChart
      labels={series.labels}
      values={series.values}
      horizontal
      heightClass="h-44"
      ariaLabel={`Ranked bar chart for ${props.widget.title}`}
    />
  );
}
