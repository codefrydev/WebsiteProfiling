
import { useState } from 'react';
import { CategoryScoreGauge } from '@/components/charts/CategoryScoreGauge';
import { useChatFollowUp } from '@/components/chat/ChatFollowUpContext';
import type { ChatBlock } from '@/components/chat/deriveChatBlocks';
import { format, strings } from '@/lib/strings';

type Block = Extract<ChatBlock, { type: 'category_scores' }>;
const cb = strings.components.chat.blocks;

export default function ChatCategoryScoresBlock({ block }: { block: Block }) {
  const { suggestFollowUp } = useChatFollowUp();
  const [view, setView] = useState<'gauges' | 'bars'>('gauges');

  return (
    <div className="rounded-xl border border-default bg-[var(--chat-bg)]/60 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {block.healthScore != null ? (
            <p className="text-sm text-muted-foreground">
              Health score:{' '}
              <span className="font-semibold text-foreground">{block.healthScore}</span>
            </p>
          ) : null}
        </div>
        <div className="flex gap-1 text-xs">
          <button
            type="button"
            onClick={() => setView('gauges')}
            className={`rounded-md px-2 py-1 ${view === 'gauges' ? 'bg-brand-700/60 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {cb.viewGauges}
          </button>
          <button
            type="button"
            onClick={() => setView('bars')}
            className={`rounded-md px-2 py-1 ${view === 'bars' ? 'bg-brand-700/60 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {cb.viewBars}
          </button>
        </div>
      </div>

      {view === 'gauges' ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {block.categories.map((cat) => (
            <CategoryScoreGauge
              key={cat.name}
              name={cat.name}
              score={cat.score}
              size="sm"
              onClick={() =>
                suggestFollowUp(format(cb.askCategoryIssues, { category: cat.name }))
              }
            />
          ))}
        </div>
      ) : (
        <ul className="space-y-2">
          {block.categories.map((cat) => {
            const score = cat.score ?? 0;
            const pct = Math.max(0, Math.min(100, score));
            return (
              <li key={cat.name}>
                <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                  <button
                    type="button"
                    className="truncate text-left text-link hover:underline"
                    onClick={() =>
                      suggestFollowUp(format(cb.askCategoryIssues, { category: cat.name }))
                    }
                  >
                    {cat.name}
                  </button>
                  <span className="shrink-0 text-muted-foreground">
                    {cat.score != null ? score : '—'}
                    {cat.issue_count != null ? ` · ${cat.issue_count} issues` : ''}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-brand-700/40">
                  <div
                    className="h-full rounded-full bg-link/70"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
