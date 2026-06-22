/**
 * Data-driven viz → ECharts option map. Each builder turns a normalized
 * QueryResult + VizOptions + theme into an ECharts `option` object. Adding a new
 * chart type = add one entry here. No `echarts/*` import (options are plain JSON).
 */
import type { QueryResult, VizType } from '@/lib/dashboard/engine/types';
import type { VizOptions } from '@/lib/dashboard/engine/doc';
import type { ChartTheme } from '@/lib/dashboard/charts/theme';

export type ChartOption = Record<string, unknown>;
type Builder = (r: QueryResult, o: VizOptions, t: ChartTheme) => ChartOption;

function wantsLegend(r: QueryResult, o: VizOptions): boolean {
  return o.showLegend ?? r.series.length > 1;
}

function baseTooltip(t: ChartTheme, trigger: 'axis' | 'item') {
  return {
    trigger,
    axisPointer: trigger === 'axis' ? { type: 'shadow' } : undefined,
    backgroundColor: t.tooltipBg,
    borderWidth: 0,
    textStyle: { color: t.tooltipText, fontSize: 12 },
  };
}

function legendBlock(r: QueryResult, o: VizOptions, t: ChartTheme) {
  if (!wantsLegend(r, o)) return undefined;
  return { type: 'scroll', top: 0, textStyle: { color: t.text, fontSize: 11 }, icon: 'roundRect' };
}

function grid(r: QueryResult, o: VizOptions) {
  return { left: 8, right: 14, top: wantsLegend(r, o) ? 30 : 12, bottom: 6, containLabel: true };
}

function catAxis(categories: string[], t: ChartTheme) {
  return {
    type: 'category',
    data: categories,
    axisLabel: { color: t.text, hideOverlap: true, rotate: categories.length > 8 ? 30 : 0 },
    axisLine: { lineStyle: { color: t.axis } },
    axisTick: { show: false },
  };
}

function valAxis(t: ChartTheme) {
  return {
    type: 'value',
    axisLabel: { color: t.text },
    splitLine: { lineStyle: { color: t.split } },
    axisLine: { show: false },
  };
}

function dataLabel(o: VizOptions, t: ChartTheme) {
  return o.dataLabels ? { show: true, color: t.text, fontSize: 10 } : { show: false };
}

const bars = (horizontal: boolean, stacked: boolean): Builder => (r, o, t) => {
  const cat = catAxis(r.categories, t);
  const val = valAxis(t);
  return {
    color: t.colors,
    tooltip: baseTooltip(t, 'axis'),
    legend: legendBlock(r, o, t),
    grid: grid(r, o),
    xAxis: horizontal ? val : cat,
    yAxis: horizontal ? cat : val,
    series: r.series.map((s) => ({
      type: 'bar',
      name: s.label,
      data: s.values,
      stack: stacked ? 'total' : undefined,
      barMaxWidth: 48,
      itemStyle: { borderRadius: stacked ? 0 : horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0] },
      label: dataLabel(o, t),
    })),
  };
};

const lines = (area: boolean, spark = false): Builder => (r, o, t) => ({
  color: t.colors,
  tooltip: spark ? undefined : baseTooltip(t, 'axis'),
  legend: spark ? undefined : legendBlock(r, o, t),
  grid: spark ? { left: 2, right: 2, top: 2, bottom: 2 } : grid(r, o),
  xAxis: { ...catAxis(r.categories, t), show: !spark, boundaryGap: false },
  yAxis: { ...valAxis(t), show: !spark },
  series: r.series.map((s) => ({
    type: 'line',
    name: s.label,
    data: s.values,
    smooth: true,
    showSymbol: !spark && r.categories.length <= 30,
    symbolSize: 5,
    areaStyle: area ? { opacity: 0.18 } : undefined,
    lineStyle: { width: spark ? 1.5 : 2 },
    label: spark ? { show: false } : dataLabel(o, t),
  })),
});

const pies = (donut: boolean): Builder => (r, o, t) => {
  const s0 = r.series[0];
  return {
    color: t.colors,
    tooltip: baseTooltip(t, 'item'),
    legend: legendBlock(r, o, t),
    series: [
      {
        type: 'pie',
        radius: donut ? ['42%', '70%'] : '70%',
        center: ['50%', wantsLegend(r, o) ? '56%' : '50%'],
        avoidLabelOverlap: true,
        data: r.categories.map((c, i) => ({ name: c, value: s0?.values[i] ?? 0 })),
        label: { color: t.text, show: o.dataLabels ?? r.categories.length <= 8 },
        itemStyle: { borderColor: t.tooltipBg, borderWidth: 1 },
      },
    ],
  };
};

const scatter: Builder = (r, o, t) => {
  const xs = r.series[0]?.values ?? [];
  const ys = r.series[1]?.values ?? [];
  const hasY = r.series.length >= 2;
  const data = r.categories.map((c, i) => [hasY ? xs[i] : i, hasY ? ys[i] : xs[i], c]);
  return {
    color: t.colors,
    tooltip: { ...baseTooltip(t, 'item'), formatter: undefined },
    grid: grid(r, o),
    xAxis: { ...valAxis(t), name: hasY ? r.series[0]?.label : undefined, scale: true },
    yAxis: { ...valAxis(t), name: hasY ? r.series[1]?.label : r.series[0]?.label, scale: true },
    series: [{ type: 'scatter', data, symbolSize: 10 }],
  };
};

const radar: Builder = (r, o, t) => {
  const max = Math.max(1, ...r.series.flatMap((s) => s.values));
  return {
    color: t.colors,
    tooltip: baseTooltip(t, 'item'),
    legend: legendBlock(r, o, t),
    radar: {
      indicator: r.categories.map((c) => ({ name: c, max })),
      axisName: { color: t.text, fontSize: 10 },
      splitLine: { lineStyle: { color: t.split } },
      axisLine: { lineStyle: { color: t.split } },
    },
    series: [
      {
        type: 'radar',
        data: r.series.map((s) => ({ name: s.label, value: s.values, areaStyle: { opacity: 0.1 } })),
      },
    ],
  };
};

const partition = (type: 'treemap' | 'funnel'): Builder => (r, o, t) => {
  const s0 = r.series[0];
  const data = r.categories.map((c, i) => ({ name: c, value: s0?.values[i] ?? 0 }));
  return {
    color: t.colors,
    tooltip: baseTooltip(t, 'item'),
    series: [
      type === 'treemap'
        ? { type: 'treemap', roam: false, breadcrumb: { show: false }, data, label: { color: '#fff' } }
        : { type: 'funnel', sort: 'descending', data, label: { color: t.text, show: true } },
    ],
  };
};

const heatmap: Builder = (r, o, t) => {
  // series = y rows; categories = x. data points [xIndex, yIndex, value].
  const data: [number, number, number][] = [];
  let max = 0;
  r.series.forEach((s, y) => {
    s.values.forEach((v, x) => {
      data.push([x, y, v]);
      if (v > max) max = v;
    });
  });
  return {
    tooltip: baseTooltip(t, 'item'),
    grid: { left: 8, right: 14, top: 30, bottom: 6, containLabel: true },
    xAxis: { type: 'category', data: r.categories, axisLabel: { color: t.text, rotate: r.categories.length > 8 ? 30 : 0 }, axisLine: { lineStyle: { color: t.axis } } },
    yAxis: { type: 'category', data: r.series.map((s) => s.label), axisLabel: { color: t.text }, axisLine: { lineStyle: { color: t.axis } } },
    visualMap: { min: 0, max: max || 1, calculable: true, orient: 'horizontal', left: 'center', bottom: 0, textStyle: { color: t.text }, inRange: { color: ['#1e293b', t.colors[0], t.colors[1]] } },
    series: [{ type: 'heatmap', data, label: { show: o.dataLabels ?? false } }],
  };
};

const gauge: Builder = (r, o, t) => {
  const min = o.axisMin ?? 0;
  const max = o.axisMax ?? 100;
  const value = r.scalar ?? 0;
  let axisColor: [number, string][] = [[1, t.colors[0]]];
  if (o.thresholds?.length) {
    const sorted = [...o.thresholds].sort((a, b) => a.value - b.value);
    axisColor = sorted.map((th) => [Math.min(1, Math.max(0, (th.value - min) / (max - min || 1))), th.color]);
    if (axisColor[axisColor.length - 1][0] < 1) axisColor.push([1, sorted[sorted.length - 1].color]);
  }
  return {
    series: [
      {
        type: 'gauge',
        min,
        max,
        progress: { show: false },
        axisLine: { lineStyle: { width: 12, color: axisColor } },
        axisTick: { show: false },
        splitLine: { length: 10, lineStyle: { color: t.axis } },
        axisLabel: { color: t.text, fontSize: 9, distance: 12 },
        pointer: { itemStyle: { color: 'auto' } },
        detail: { valueAnimation: true, color: t.text, fontSize: 22, offsetCenter: [0, '60%'], formatter: '{value}' },
        data: [{ value: Math.round(value * 100) / 100 }],
      },
    ],
  };
};

export const VIZ_TO_OPTION: Partial<Record<VizType, Builder>> = {
  bar: bars(false, false),
  'horizontal-bar': bars(true, false),
  'stacked-bar': bars(false, true),
  line: lines(false),
  area: lines(true),
  sparkline: lines(false, true),
  pie: pies(false),
  doughnut: pies(true),
  scatter,
  radar,
  treemap: partition('treemap'),
  funnel: partition('funnel'),
  heatmap,
  gauge,
};

/** True when this viz renders through ChartRenderer (ECharts) vs a dedicated widget. */
export function isEChartsViz(viz: VizType): boolean {
  return viz in VIZ_TO_OPTION;
}
