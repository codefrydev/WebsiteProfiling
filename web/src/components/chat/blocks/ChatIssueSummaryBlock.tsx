
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
    <div className="rounded-xl border border-md-sys-outline-variant/40 bg-md-sys-surface/60 p-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        {block.siteName ? (
          <p className="text-sm font-medium text-md-sys-on-surface">{block.siteName}</p>
        ) : null}
        {block.healthScore != null ? (
          <p className="text-2xl font-semibold tabular-nums text-md-sys-on-surface">
            {block.healthScore}
            <span className="ml-1 text-sm font-normal text-md-sys-on-surface-variant">/100</span>
          </p>
        ) : null}
        <p className="text-xs text-md-sys-on-surface-variant">{total} issues</p>
        {block.totalUrls != null ? (
          <p className="text-xs text-md-sys-on-surface-variant">
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
              className="rounded-full border border-md-sys-outline-variant/40 bg-md-sys-surface-container/50 px-2.5 py-1 text-xs text-md-sys-on-surface"
            >
              {p}: <span className="font-semibold">{n}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
