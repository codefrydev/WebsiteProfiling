
import { useMemo } from 'react';
import { Doughnut } from 'react-chartjs-2';
import { palette } from '@/utils/chartPalette';
import { registerChartJsBase } from '@/utils/chartJsDefaults';
import { doughnutOptionsWithPercentTooltip } from '@/lib/chartDoughnutUtils';
import { strings } from '@/lib/strings';
import type { ChatBlock } from '@/components/chat/deriveChatBlocks';

registerChartJsBase();

type Block = Extract<ChatBlock, { type: 'status_breakdown' }>;
const cb = strings.components.chat.blocks;

export default function ChatStatusBreakdownBlock({ block }: { block: Block }) {
  const chartData = useMemo(() => {
    const colors = palette(block.items.length);
    return {
      labels: block.items.map((i) => i.label),
      datasets: [{ data: block.items.map((i) => i.value), backgroundColor: colors, borderWidth: 0 }],
    };
  }, [block.items]);

  return (
    <div className="rounded-xl border border-default bg-[var(--chat-bg)]/60 p-4">
      <p className="mb-1 text-sm font-medium text-bright">{cb.statusBreakdown}</p>
      {block.successRate != null ? (
        <p className="mb-3 text-xs text-muted-foreground">
          {cb.successRate}:{' '}
          {(block.successRate > 1 ? block.successRate : block.successRate * 100).toFixed(1)}%
          {block.totalUrls != null ? ` · ${block.totalUrls} URLs` : ''}
        </p>
      ) : null}
      <div className="mx-auto h-48 w-full max-w-xs">
        <Doughnut data={chartData} options={doughnutOptionsWithPercentTooltip()} />
      </div>
    </div>
  );
}
