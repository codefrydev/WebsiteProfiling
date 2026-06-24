
import { Loader2 } from 'lucide-react';
import { format, strings } from '@/lib/strings';

const c = strings.components.chat;

export interface ChatActivityBarProps {
  busy: boolean;
  statusText?: string;
  elapsedSec?: number;
}

export default function ChatActivityBar({ busy, statusText, elapsedSec }: ChatActivityBarProps) {
  if (!busy && !statusText) return null;

  return (
    <div
      className="mx-auto flex w-full max-w-3xl items-center justify-center gap-2 px-4 pb-1 text-xs text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      {busy ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden /> : null}
      <span>{statusText || c.thinking}</span>
      {busy && elapsedSec != null && elapsedSec > 0 ? (
        <span>· {format(c.elapsed, { seconds: elapsedSec })}</span>
      ) : null}
    </div>
  );
}
