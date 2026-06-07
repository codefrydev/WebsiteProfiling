'use client';

import { useMemo } from 'react';
import { Doughnut } from 'react-chartjs-2';
import { SimpleBarChart } from '@/components/charts/SimpleBarChart';
import { palette } from '@/utils/chartPalette';
import { registerChartJsBase } from '@/utils/chartJsDefaults';
import { doughnutOptionsWithPercentTooltip } from '@/lib/chartDoughnutUtils';
import type { ChatBlock } from '@/components/chat/deriveChatBlocks';

registerChartJsBase();

type Block = Extract<ChatBlock, { type: 'label_value_chart' }>;

function preferBarChart(items: { label: string; value: number }[]): boolean {
  if (items.length > 6) return true;
  return items.some((i) => i.label.length > 20);
}

export default function ChatLabelValueChartBlock({ block }: { block: Block }) {
  const useBar = preferBarChart(block.items);

  const doughnutData = useMemo(() => {
    const colors = palette(block.items.length);
    return {
      labels: block.items.map((i) => i.label),
      datasets: [
        {
          data: block.items.map((i) => i.value),
          backgroundColor: colors,
          borderWidth: 0,
        },
      ],
    };
  }, [block.items]);

  return (
    <div className="rounded-xl border border-default bg-[var(--chat-bg)]/60 p-4">
      <p className="mb-3 text-sm font-medium text-bright">{block.title}</p>
      {useBar ? (
        <SimpleBarChart
          labels={block.items.map((i) => i.label)}
          values={block.items.map((i) => i.value)}
          ariaLabel={block.title}
          heightClass={block.items.length > 8 ? 'h-64' : 'h-48'}
        />
      ) : (
        <div className="mx-auto h-48 w-full max-w-xs">
          <Doughnut data={doughnutData} options={doughnutOptionsWithPercentTooltip()} />
        </div>
      )}
    </div>
  );
}
