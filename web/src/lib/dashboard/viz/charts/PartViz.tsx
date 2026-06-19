'use client';

import { useMemo } from 'react';
import { Doughnut, Pie } from 'react-chartjs-2';
import { palette } from '@/utils/chartPalette';
import { doughnutOptionsBottomLegend, registerChartJsBase } from '@/utils/chartJsDefaults';
import { CompactStackedBar } from '@/components/charts/compact/CompactStackedBar';
import { extractChartSeries } from '@/lib/dashboard/viz/series';
import { EmptyData } from '@/lib/dashboard/viz/EmptyData';
import type { VizRenderProps } from '@/lib/dashboard/viz/types';

registerChartJsBase();

function usePieData(props: VizRenderProps) {
  return useMemo(() => {
    const series = extractChartSeries(props.widget, props.data, props.catalog, props.opts);
    if (!series) return null;
    const colors = palette(series.labels.length);
    return {
      labels: series.labels,
      datasets: [{ data: series.values, backgroundColor: colors, borderWidth: 0 }],
    };
  }, [props.widget, props.data, props.catalog, props.opts]);
}

export function PieViz(props: VizRenderProps) {
  const data = usePieData(props);
  const opts = useMemo(() => doughnutOptionsBottomLegend(), []);
  if (!data) return <EmptyData />;
  return <div className="h-44"><Pie data={data} options={opts} /></div>;
}

export function DoughnutViz(props: VizRenderProps) {
  const data = usePieData(props);
  const opts = useMemo(() => doughnutOptionsBottomLegend(), []);
  if (!data) return <EmptyData />;
  return <div className="h-44"><Doughnut data={data} options={opts} /></div>;
}

export function StackedBarViz(props: VizRenderProps) {
  const series = useMemo(
    () => extractChartSeries(props.widget, props.data, props.catalog, props.opts),
    [props.widget, props.data, props.catalog, props.opts],
  );
  if (!series) return <EmptyData />;
  const colors = palette(series.labels.length);
  const segments = series.labels.map((label, i) => ({
    label,
    value: series.values[i] ?? 0,
    color: colors[i],
  }));
  return (
    <div className="py-3 px-1">
      <CompactStackedBar segments={segments} />
    </div>
  );
}
