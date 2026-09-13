
import type { ChatBlock } from '@/components/chat/deriveChatBlocks';
import { formatChatUrlDisplay } from '@/lib/formatChatUrl';

type Block = Extract<ChatBlock, { type: 'image_attention_table' }>;

const DISPLAY_LIMIT = 10;

function formatBytes(n: number): string {
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

function formatReason(r: string): string {
  return r.replace(/_/g, ' ');
}

export default function ChatImageAttentionTableBlock({ block }: { block: Block }) {
  const shown = block.items.slice(0, DISPLAY_LIMIT);
  const remaining = (block.total ?? block.items.length) - shown.length;

  return (
    <div className="overflow-hidden rounded-xl border border-md-sys-outline-variant/40 bg-md-sys-surface/60">
      <p className="border-b border-md-sys-outline-variant/30 px-3 py-2 text-xs font-medium text-md-sys-on-surface">
        {block.title}
      </p>
      <ul className="divide-y divide-md-sys-outline-variant/30">
        {shown.map((item, i) => {
          const href = item.url || item.pageUrl;
          const label = href ? formatChatUrlDisplay(href) : 'Page-level issue';
          return (
            <li key={`${href || 'page'}-${i}`} className="px-3 py-2.5 text-xs">
              <div className="flex items-start justify-between gap-2">
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 flex-1 font-mono text-md-sys-primary hover:underline break-all"
                    title={href}
                  >
                    {label}
                  </a>
                ) : (
                  <span className="text-md-sys-on-surface">{label}</span>
                )}
                {item.sizeBytes != null && Number.isFinite(item.sizeBytes) ? (
                  <span className="shrink-0 tabular-nums text-md-sys-on-surface-variant">
                    {formatBytes(item.sizeBytes)}
                  </span>
                ) : null}
              </div>
              {item.reasons.length ? (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {item.reasons.map((r) => (
                    <span
                      key={r}
                      className="rounded-full border border-md-sys-outline-variant/40 bg-md-sys-surface-container/50 px-2 py-0.5 text-[10px] text-md-sys-on-surface-variant"
                    >
                      {formatReason(r)}
                    </span>
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {remaining > 0 || block.truncated ? (
        <p className="border-t border-md-sys-outline-variant/30 px-3 py-2 text-xs text-md-sys-on-surface-variant">
          {remaining > 0 ? `${remaining} more not shown` : 'Results truncated'}
        </p>
      ) : null}
    </div>
  );
}
