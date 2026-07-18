import { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import ChartCard from '@/components/ChartCard';
import { format, strings } from '@/lib/strings';
import { barOptionsHorizontal } from '@/utils/chartJsDefaults';
import { palette } from '@/utils/chartPalette';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

export interface VelocitySnapshot {
  capturedAt: string;
  referringDomains: number;
}

interface BacklinksVelocityChartProps {
  snapshots: VelocitySnapshot[];
  devData?: unknown;
}

export default function BacklinksVelocityChart({ snapshots, devData }: BacklinksVelocityChartProps) {
  const vb = strings.views.backlinks;

  const chart = useMemo(() => {
    if (snapshots.length < 2) return null;
    const labels = snapshots.map((s) => {
      const d = new Date(s.capturedAt);
      return Number.isNaN(d.getTime()) ? s.capturedAt : d.toLocaleDateString();
    });
    const values = snapshots.map((s) => s.referringDomains);
    const { labels: sortedLabels, values: sortedValues } = {
      labels,
      values,
    };
    return {
      data: {
        labels: sortedLabels,
        datasets: [
          {
            data: sortedValues,
            backgroundColor: palette(sortedLabels.length),
            label: vb.kpi.referringDomains,
          },
        ],
      },
      latest: snapshots[snapshots.length - 1],
      prior: snapshots[snapshots.length - 2],
    };
  }, [snapshots, vb.kpi.referringDomains]);

  const opts = useMemo(() => barOptionsHorizontal(vb.kpi.referringDomains), [vb.kpi.referringDomains]);

  if (!chart) return null;

  const delta = chart.latest.referringDomains - chart.prior.referringDomains;

  return (
    <ChartCard
      title={vb.velocityTitle}
      hint={format(vb.velocityDelta, {
        latest: chart.latest.referringDomains.toLocaleString(),
        delta: delta >= 0 ? `+${delta}` : String(delta),
      })}
      ariaLabel={vb.velocityTitle}
      heightClass="h-48"
      devData={devData}
    >
      <Bar data={chart.data} options={opts} />
    </ChartCard>
  );
}
