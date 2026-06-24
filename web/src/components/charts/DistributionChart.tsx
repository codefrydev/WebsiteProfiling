
import type { StatusDistribution } from '@/lib/statusDistribution';
import { palette } from '@/utils/chartPalette';
import { D3DonutChart } from './d3/D3DonutChart';
import { D3HorizontalBarChart } from './d3/D3HorizontalBarChart';

export interface StatusDistributionChartProps {
  distribution: StatusDistribution;
  heightClass?: string;
}

/** Renders grouped HTTP status as doughnut (≤6 slices) or horizontal bar. */
export function StatusDistributionChart({ distribution, heightClass = 'h-56' }: StatusDistributionChartProps) {
  const { mode, labels, values, aria } = distribution;
  const colors = palette(labels.length);

  if (mode === 'doughnut') {
    return (
      <D3DonutChart
        labels={labels}
        values={values}
        colors={colors}
        ariaLabel={aria}
        heightClass={heightClass}
      />
    );
  }

  return (
    <D3HorizontalBarChart
      data={{
        labels,
        series: [{ values, colors }],
      }}
      ariaLabel={aria}
      heightClass={heightClass}
    />
  );
}
