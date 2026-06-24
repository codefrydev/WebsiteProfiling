
import { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { getChartTitleColor, getGridColor } from '@/utils/chartJsDefaults';
import { strings } from '@/lib/strings';
import type { ChatBlock } from '@/components/chat/deriveChatBlocks';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

type Block = Extract<ChatBlock, { type: 'health_trend' }>;
const cb = strings.components.chat.blocks;

export default function ChatHealthTrendBlock({ block }: { block: Block }) {
  const chartData = useMemo(
    () => ({
      labels: block.points.map((p) => p.label),
      datasets: [
        {
          label: cb.healthScoreAxis,
          data: block.points.map((p) => p.score),
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.15)',
          tension: 0.25,
          fill: true,
        },
      ],
    }),
    [block.points],
  );

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          min: 0,
          max: 100,
          grid: { color: getGridColor() },
          title: { display: true, text: cb.healthScoreAxis, color: getChartTitleColor() },
        },
        x: { grid: { color: getGridColor() } },
      },
    }),
    [],
  );

  return (
    <div className="rounded-xl border border-default bg-[var(--chat-bg)]/60 p-4">
      <p className="mb-3 text-sm font-medium text-bright">{block.title}</p>
      <div className="h-48">
        <Line data={chartData} options={options} />
      </div>
    </div>
  );
}
