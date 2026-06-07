'use client';

import { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import { palette } from '@/utils/chartPalette';
import { barOptionsHorizontal, registerChartJsBase } from '@/utils/chartJsDefaults';

registerChartJsBase();

export interface SimpleBarChartProps {
  labels: string[];
  values: number[];
  horizontal?: boolean;
  ariaLabel?: string;
  heightClass?: string;
}

export function SimpleBarChart({
  labels,
  values,
  horizontal = true,
  ariaLabel,
  heightClass = 'h-48',
}: SimpleBarChartProps) {
  const data = useMemo(
    () => ({
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: palette(labels.length),
          borderRadius: 4,
        },
      ],
    }),
    [labels, values],
  );

  return (
    <div className={heightClass} role="img" aria-label={ariaLabel}>
      <Bar data={data} options={horizontal ? barOptionsHorizontal() : undefined} />
    </div>
  );
}
