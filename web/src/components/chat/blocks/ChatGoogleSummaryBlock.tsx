'use client';

import { SimpleBarChart } from '@/components/charts/SimpleBarChart';
import { useChatFollowUp } from '@/components/chat/ChatFollowUpContext';
import type { ChatBlock } from '@/components/chat/deriveChatBlocks';
import { format, strings } from '@/lib/strings';

type Block = Extract<ChatBlock, { type: 'google_summary' }>;
const cb = strings.components.chat.blocks;

export default function ChatGoogleSummaryBlock({ block }: { block: Block }) {
  const { suggestFollowUp } = useChatFollowUp();
  const hasKpis =
    block.clicks != null || block.impressions != null || block.ctr != null;

  return (
    <div className="rounded-xl border border-default bg-[var(--chat-bg)]/60 p-4">
      <p className="mb-3 text-sm font-medium text-bright">{cb.googleSummary}</p>

      {hasKpis ? (
        <div className="mb-4 flex flex-wrap gap-4 text-xs">
          {block.clicks != null ? (
            <div>
              <span className="text-muted-foreground">{cb.clicks}</span>{' '}
              <span className="font-semibold text-foreground">{block.clicks.toLocaleString()}</span>
            </div>
          ) : null}
          {block.impressions != null ? (
            <div>
              <span className="text-muted-foreground">{cb.impressions}</span>{' '}
              <span className="font-semibold text-foreground">
                {block.impressions.toLocaleString()}
              </span>
            </div>
          ) : null}
          {block.ctr != null ? (
            <div>
              <span className="text-muted-foreground">{cb.ctr}</span>{' '}
              <span className="font-semibold text-foreground">
                {(block.ctr * 100).toFixed(2)}%
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      {block.queries.length > 0 ? (
        <div className="mb-4">
          <p className="mb-2 text-xs text-muted-foreground">{cb.topQueries}</p>
          <SimpleBarChart
            labels={block.queries.map((q) =>
              q.query.length > 28 ? `${q.query.slice(0, 28)}…` : q.query,
            )}
            values={block.queries.map((q) => q.clicks ?? 0)}
            ariaLabel={cb.topQueries}
          />
          <ul className="mt-2 space-y-1">
            {block.queries.slice(0, 5).map((q) => (
              <li key={q.query} className="flex items-center justify-between gap-2 text-xs">
                <button
                  type="button"
                  className="truncate text-left text-link hover:underline"
                  onClick={() => suggestFollowUp(format(cb.askTopQuery, { query: q.query }))}
                >
                  {q.query}
                </button>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {q.clicks ?? 0} clicks
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {block.pages.length > 0 ? (
        <div>
          <p className="mb-2 text-xs text-muted-foreground">{cb.topPages}</p>
          <ul className="space-y-1 text-xs">
            {block.pages.map((p) => (
              <li key={p.page} className="flex justify-between gap-2">
                <span className="truncate font-mono text-foreground" title={p.page}>
                  {p.page}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {p.clicks ?? 0}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
