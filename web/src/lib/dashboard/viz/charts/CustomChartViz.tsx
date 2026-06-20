'use client';

import { useRef, useEffect, useMemo } from 'react';
import {
  Chart,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  PieController,
  ArcElement,
  DoughnutController,
  RadarController,
  RadialLinearScale,
  PolarAreaController,
  BubbleController,
  ScatterController,
  CategoryScale,
  LinearScale,
  LogarithmicScale,
  TimeScale,
  Tooltip,
  Legend,
  Filler,
  type ChartConfiguration,
} from 'chart.js';
import { EmptyData } from '@/lib/dashboard/viz/EmptyData';
import type { VizRenderProps } from '@/lib/dashboard/viz/types';
import type { CustomChartSpec } from '@/lib/dashboard/types';

// Register all chart types so the AI can use any of them
Chart.register(
  BarController, BarElement,
  LineController, LineElement, PointElement,
  PieController, ArcElement,
  DoughnutController,
  RadarController, RadialLinearScale,
  PolarAreaController,
  BubbleController,
  ScatterController,
  CategoryScale, LinearScale, LogarithmicScale, TimeScale,
  Tooltip, Legend, Filler,
);

const PALETTE = [
  'rgba(59,130,246,0.8)',
  'rgba(16,185,129,0.8)',
  'rgba(245,158,11,0.8)',
  'rgba(239,68,68,0.8)',
  'rgba(139,92,246,0.8)',
  'rgba(20,184,166,0.8)',
  'rgba(249,115,22,0.8)',
  'rgba(236,72,153,0.8)',
];

function buildChartData(
  spec: CustomChartSpec,
  rows: Record<string, unknown>[],
): ChartConfiguration['data'] {
  // Prefer explicit data from spec
  if (spec.data) {
    return spec.data as unknown as ChartConfiguration['data'];
  }

  const labelField = spec.labelField ?? 'label';
  const labels = rows.map((r) => String(r[labelField] ?? ''));
  const series = spec.series ?? [];

  if (series.length > 0) {
    return {
      labels,
      datasets: series.map((s, i) => ({
        label: s.label,
        data: rows.map((r) => {
          const v = r[s.field];
          return typeof v === 'number' ? v : 0;
        }),
        backgroundColor: s.backgroundColor ?? PALETTE[i % PALETTE.length],
        borderColor: s.borderColor,
        fill: false,
      })),
    };
  }

  // Fallback: treat numeric columns as datasets
  if (rows.length > 0) {
    const numericCols = Object.entries(rows[0])
      .filter(([k, v]) => k !== labelField && typeof v === 'number')
      .map(([k]) => k);
    return {
      labels,
      datasets: numericCols.map((col, i) => ({
        label: col,
        data: rows.map((r) => (typeof r[col] === 'number' ? (r[col] as number) : 0)),
        backgroundColor: PALETTE[i % PALETTE.length],
        fill: false,
      })),
    };
  }

  return { labels: [], datasets: [] };
}

export function CustomChartViz({ data, opts, widget }: VizRenderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  const spec = opts.chartSpec as CustomChartSpec | undefined;
  const rows = useMemo<Record<string, unknown>[]>(() => {
    if (!data) return [];
    if (Array.isArray(data.rows)) return data.rows as Record<string, unknown>[];
    return [];
  }, [data]);

  const chartConfig = useMemo<ChartConfiguration | null>(() => {
    if (!spec?.type) return null;
    const chartData = buildChartData(spec, rows);
    // Spread user options first so our required overrides always win.
    // Then merge plugins carefully so the user's plugin config is preserved
    // alongside our defaults.
    const { plugins: userPlugins, ...restOptions } = spec.options ?? {};
    return {
      type: spec.type as ChartConfiguration['type'],
      data: chartData,
      options: {
        ...restOptions,
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true },
          ...(userPlugins as object | undefined),
        },
      },
    };
  }, [spec, rows]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !chartConfig) return;
    chartRef.current?.destroy();
    try {
      chartRef.current = new Chart(canvas, chartConfig);
    } catch {
      // destroyed before mount — ignore
    }
    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [chartConfig]);

  if (!spec?.type) {
    return <EmptyData message="No chart spec — ask AI to generate one" />;
  }

  return (
    <div className="relative w-full h-full min-h-[160px]" aria-label={`Custom chart: ${widget.title}`}>
      <canvas ref={canvasRef} />
    </div>
  );
}
