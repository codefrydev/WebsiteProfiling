
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
      ? 'border-md-sys-error/30 bg-md-sys-error-container/30 text-md-sys-on-error-container'
      : block.variant === 'empty'
        ? 'border-md-sys-success/30 bg-md-sys-success-container/30 text-md-sys-on-success-container'
        : 'border-md-sys-warning/30 bg-md-sys-warning-container/30 text-md-sys-on-warning-container';

  return (
    <div className={`rounded-2xl border p-3 text-sm ${tone}`}>
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div className="min-w-0">
          <p className="font-mono text-xs text-md-sys-on-surface-variant">{block.toolName}</p>
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
    <p className="rounded-2xl border border-md-sys-outline-variant/40 bg-md-sys-surface/40 px-3 py-2 text-xs text-md-sys-on-surface-variant">
      {format(c.truncatedToolNote, {
        tool: block.toolName,
        shown: block.shown,
        total: block.total,
      })}
    </p>
  );
}
