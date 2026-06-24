
import { PRIORITY_ORDER } from '@/lib/issuePriority';
import type { ChatBlock } from '@/components/chat/deriveChatBlocks';

type Block = Extract<ChatBlock, { type: 'issue_summary' }>;

function formatSuccessRate(rate: number): string {
  const pct = rate > 1 ? rate : rate * 100;
  return `${pct.toFixed(pct % 1 === 0 ? 0 : 1)}%`;
}

export default function ChatIssueSummaryBlock({ block }: { block: Block }) {
  const total =
    block.totalIssues ??
    PRIORITY_ORDER.reduce((sum, p) => sum + (block.counts[p] || 0), 0);

  return (
    <div className="rounded-xl border border-default bg-[var(--chat-bg)]/60 p-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        {block.siteName ? (
          <p className="text-sm font-medium text-bright">{block.siteName}</p>
        ) : null}
        {block.healthScore != null ? (
          <p className="text-2xl font-semibold tabular-nums text-foreground">
            {block.healthScore}
            <span className="ml-1 text-sm font-normal text-muted-foreground">/100</span>
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">{total} issues</p>
        {block.totalUrls != null ? (
          <p className="text-xs text-muted-foreground">
            {block.totalUrls} URLs
            {block.successRate != null ? ` · ${formatSuccessRate(block.successRate)} success` : ''}
          </p>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {PRIORITY_ORDER.map((p) => {
          const n = block.counts[p] || 0;
          if (!n) return null;
          return (
            <span
              key={p}
              className="rounded-full border border-default bg-brand-800/50 px-2.5 py-1 text-xs text-foreground"
            >
              {p}: <span className="font-semibold">{n}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
