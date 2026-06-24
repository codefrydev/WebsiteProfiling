
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { format, strings } from '@/lib/strings';
import type { ChatBlock } from '@/components/chat/deriveChatBlocks';

const c = strings.components.chat;

type Block = Extract<ChatBlock, { type: 'tool_status' }>;

export default function ChatToolStatusBlock({ block }: { block: Block }) {
  const Icon =
    block.variant === 'empty' ? CheckCircle2 : block.variant === 'error' ? AlertCircle : Info;
  const tone =
    block.variant === 'error'
      ? 'border-red-500/30 bg-red-500/10 text-red-100'
      : block.variant === 'empty'
        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
        : 'border-amber-500/30 bg-amber-500/10 text-amber-100';

  return (
    <div className={`rounded-xl border p-3 text-sm ${tone}`}>
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div className="min-w-0">
          <p className="font-mono text-xs text-muted-foreground">{block.toolName}</p>
          <p className="mt-1">{block.message}</p>
          {block.hint ? <p className="mt-1 text-xs opacity-90">{block.hint}</p> : null}
        </div>
      </div>
    </div>
  );
}

export function ChatToolTruncatedBlock({
  block,
}: {
  block: Extract<ChatBlock, { type: 'tool_truncated' }>;
}) {
  return (
    <p className="rounded-lg border border-default bg-[var(--chat-bg)]/40 px-3 py-2 text-xs text-muted-foreground">
      {format(c.truncatedToolNote, {
        tool: block.toolName,
        shown: block.shown,
        total: block.total,
      })}
    </p>
  );
}
