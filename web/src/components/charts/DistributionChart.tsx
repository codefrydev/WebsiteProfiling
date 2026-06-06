'use client';

import { Doughnut, Bar } from 'react-chartjs-2';
import type { StatusDistribution } from '@/lib/statusDistribution';
import { palette } from '@/utils/chartPalette';
import { barOptionsHorizontal } from '@/utils/chartJsDefaults';
import { doughnutOptionsWithPercentTooltip } from '@/lib/chartDoughnutUtils';
import { ChartAccessibleFallback } from './ChartAccessibleFallback';

export interface StatusDistributionChartProps {
  distribution: StatusDistribution;
  heightClass?: string;
}

/** Renders grouped HTTP status as doughnut (≤6 slices) or horizontal bar. */
export function StatusDistributionChart({ distribution, heightClass = 'h-56' }: StatusDistributionChartProps) {
  const { mode, labels, values, aria } = distribution;
  const rows = labels.map((label, i) => [label, values[i] ?? 0] as [string, string | number]);
  const colors = palette(labels.length);

  if (mode === 'doughnut') {
    return (
      <ChartAccessibleFallback summary={aria} rows={rows}>
        <div className={`${heightClass} flex items-center justify-center`} role="presentation">
          <div className="w-full max-w-[280px] h-full">
            <Doughnut
              data={{
                labels,
                datasets: [
                  {
                    data: values,
                    backgroundColor: colors,
                    borderColor: 'rgba(15,23,42,0.8)',
                    borderWidth: 2,
                  },
                ],
              }}
              options={doughnutOptionsWithPercentTooltip()}
            />
          </div>
        </div>
      </ChartAccessibleFallback>
    );
  }

  return (
    <ChartAccessibleFallback summary={aria} rows={rows}>
      <div className={heightClass} role="presentation">
        <Bar
          data={{
            labels,
            datasets: [{ data: values, backgroundColor: colors }],
          }}
          options={barOptionsHorizontal()}
        />
      </div>
    </ChartAccessibleFallback>
  );
}
