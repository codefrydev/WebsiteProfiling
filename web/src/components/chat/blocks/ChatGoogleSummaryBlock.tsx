
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
    <div className="rounded-xl border border-md-sys-outline-variant/40 bg-md-sys-surface/60 p-4">
      <p className="mb-3 text-sm font-medium text-md-sys-on-surface">{cb.googleSummary}</p>

      {hasKpis ? (
        <div className="mb-4 flex flex-wrap gap-4 text-xs">
          {block.clicks != null ? (
            <div>
              <span className="text-md-sys-on-surface-variant">{cb.clicks}</span>{' '}
              <span className="font-semibold text-md-sys-on-surface">{block.clicks.toLocaleString()}</span>
            </div>
          ) : null}
          {block.impressions != null ? (
            <div>
              <span className="text-md-sys-on-surface-variant">{cb.impressions}</span>{' '}
              <span className="font-semibold text-md-sys-on-surface">
                {block.impressions.toLocaleString()}
              </span>
            </div>
          ) : null}
          {block.ctr != null ? (
            <div>
              <span className="text-md-sys-on-surface-variant">{cb.ctr}</span>{' '}
              <span className="font-semibold text-md-sys-on-surface">
                {(block.ctr * 100).toFixed(2)}%
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      {block.queries.length > 0 ? (
        <div className="mb-4">
          <p className="mb-2 text-xs text-md-sys-on-surface-variant">{cb.topQueries}</p>
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
                  className="truncate text-left text-md-sys-primary hover:underline"
                  onClick={() => suggestFollowUp(format(cb.askTopQuery, { query: q.query }))}
                >
                  {q.query}
                </button>
                <span className="shrink-0 tabular-nums text-md-sys-on-surface-variant">
                  {q.clicks ?? 0} clicks
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {block.pages.length > 0 ? (
        <div>
          <p className="mb-2 text-xs text-md-sys-on-surface-variant">{cb.topPages}</p>
          <ul className="space-y-1 text-xs">
            {block.pages.map((p) => (
              <li key={p.page} className="flex justify-between gap-2">
                <span className="truncate font-mono text-md-sys-on-surface" title={p.page}>
                  {p.page}
                </span>
                <span className="shrink-0 tabular-nums text-md-sys-on-surface-variant">
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
