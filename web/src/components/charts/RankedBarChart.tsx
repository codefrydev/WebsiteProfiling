'use client';

import { Bar } from 'react-chartjs-2';
import type { ChartData, ChartOptions } from 'chart.js';
import { barOptionsHorizontal, registerChartJsBase } from '@/utils/chartJsDefaults';
import { ChartAccessibleFallback } from './ChartAccessibleFallback';
import { ChartPanel } from './ChartPanel';

export interface RankedBarChartProps {
  data: ChartData<'bar'>;
  options?: ChartOptions<'bar'>;
  ariaSummary: string;
  heightClass?: string;
}

/** Horizontal ranked bar with mandatory text alternative. */
export function RankedBarChart({
  data,
  options,
  ariaSummary,
  heightClass = 'h-56',
}: RankedBarChartProps) {
  const labels = (data.labels as string[]) ?? [];
  const values = (data.datasets[0]?.data as number[]) ?? [];
  const rows = labels.map((label, i) => [label, values[i] ?? 0] as [string, string | number]);

  return (
    <ChartAccessibleFallback summary={ariaSummary} rows={rows}>
      <ChartPanel heightClass={heightClass}>
        <Bar data={data} options={options ?? barOptionsHorizontal(undefined, labels)} />
      </ChartPanel>
    </ChartAccessibleFallback>
  );
}
