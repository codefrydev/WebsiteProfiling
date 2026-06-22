'use client';

import { useEffect, useRef, useState } from 'react';
import type { QueryResult, VizType } from '@/lib/dashboard/engine/types';
import type { VizOptions } from '@/lib/dashboard/engine/doc';
import { VIZ_TO_OPTION } from '@/lib/dashboard/charts/optionBuilders';
import { buildChartTheme } from '@/lib/dashboard/charts/theme';
import type { EChartsInstance } from '@/lib/dashboard/charts/echartsCore';

export interface ChartRendererProps {
  viz: VizType;
  result: QueryResult;
  options?: VizOptions;
  /** Click on a category/segment → cross-filter. */
  onSelect?: (category: string, seriesKey?: string) => void;
  /** Receives the ECharts instance once ready (used for PNG export). */
  onReady?: (chart: EChartsInstance) => void;
}

export default function ChartRenderer({ viz, result, options, onSelect, onReady }: ChartRendererProps) {
  const elRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsInstance | null>(null);
  const [ready, setReady] = useState(false);

  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  // Init once (client only); dispose on unmount.
  useEffect(() => {
    let disposed = false;
    let ro: ResizeObserver | null = null;
    void (async () => {
      const echarts = (await import('@/lib/dashboard/charts/echartsCore')).default;
      if (disposed || !elRef.current) return;
      const chart = echarts.init(elRef.current, null, { renderer: 'canvas' });
      chartRef.current = chart;
      chart.on('click', (params: unknown) => {
        const p = params as { name?: string; seriesName?: string };
        if (p?.name != null) onSelectRef.current?.(String(p.name), p.seriesName);
      });
      ro = new ResizeObserver(() => chart.resize());
      ro.observe(elRef.current);
      onReadyRef.current?.(chart);
      setReady(true);
    })();
    return () => {
      disposed = true;
      ro?.disconnect();
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  // (Re)render the option whenever data/options/viz change.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !ready) return;
    const builder = VIZ_TO_OPTION[viz];
    if (!builder) {
      chart.clear();
      return;
    }
    const theme = buildChartTheme(options?.palette);
    chart.setOption(builder(result, options ?? {}, theme), { notMerge: true });
  }, [ready, viz, result, options]);

  return <div ref={elRef} className="w-full h-full min-h-[120px]" aria-label={`${viz} chart`} />;
}
