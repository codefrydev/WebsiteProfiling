
import { useState } from 'react';
import ChartRenderer from '@/lib/dashboard/charts/ChartRenderer';
import { toQueryResult } from './chatChartAdapter';
import type { ChatBlock } from '@/components/chat/deriveChatBlocks';
import type { VizType } from '@/lib/dashboard/engine/types';

type Block = Extract<ChatBlock, { type: 'generic_chart' }>;

const VIZ_OPTIONS: { viz: VizType; label: string }[] = [
  { viz: 'bar', label: 'Bar' },
  { viz: 'line', label: 'Line' },
  { viz: 'pie', label: 'Pie' },
];

export default function ChatChartBlock({ block }: { block: Block }) {
  const [viz, setViz] = useState<VizType>(block.vizType);

  return (
    <div className="rounded-xl border border-default bg-[var(--chat-bg)]/60 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-bright">{block.title}</p>
        <div className="flex gap-1" role="group" aria-label="Chart type">
          {VIZ_OPTIONS.map((opt) => (
            <button
              key={opt.viz}
              type="button"
              aria-pressed={viz === opt.viz}
              onClick={() => setViz(opt.viz)}
              className={`rounded-md px-2 py-0.5 text-xs transition-colors ${
                viz === opt.viz
                  ? 'bg-brand-700 text-bright shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div className="h-48">
        <ChartRenderer viz={viz} result={toQueryResult(block.title, block.items)} />
      </div>
    </div>
  );
}
