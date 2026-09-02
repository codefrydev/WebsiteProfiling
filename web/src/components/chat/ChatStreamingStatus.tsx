import { useState } from 'react';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import type { ToolActivityItem } from '@/components/chat/ChatToolActivity';
import { formatToolDisplayName } from '@/components/chat/chatStatusLabels';
import { format, strings } from '@/lib/strings';

const c = strings.components.chat;

export interface ChatStreamingStatusProps {
  statusText?: string;
  toolActivity?: ToolActivityItem[];
}

function isFailed(item: ToolActivityItem): boolean {
  return item.status === 'done' && Boolean(item.result && typeof item.result.error === 'string');
}

export default function ChatStreamingStatus({
  statusText,
  toolActivity,
}: ChatStreamingStatusProps) {
  const running = toolActivity?.filter((t) => t.status === 'running') ?? [];
  const doneCount = toolActivity?.filter((t) => t.status === 'done').length ?? 0;
  const totalTools = toolActivity?.length ?? 0;
  const hasToolDetails = totalTools > 0;
  const [open, setOpen] = useState(true);
  const expanded = open || running.length > 0;

  return (
    <div
      className="rounded-lg border border-default/50 bg-[var(--chat-bg)]/40 px-3 py-2.5"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-2.5">
        <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-violet-400" aria-hidden />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-start gap-2">
            <p className="min-w-0 flex-1 text-sm text-foreground">{statusText || c.thinking}</p>
            {hasToolDetails ? (
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                aria-expanded={expanded}
                aria-label={expanded ? c.collapseToolActivity : c.expandToolActivity}
              >
                {expanded ? (
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                )}
                <span>{format(c.toolsProgress, { done: doneCount, total: totalTools })}</span>
              </button>
            ) : null}
          </div>

          {hasToolDetails && expanded ? (
            <ul className="space-y-1 border-t border-default/30 pt-1.5 text-xs">
              {toolActivity!.map((tool) => (
                <li key={tool.id} className="flex items-start gap-2 text-muted-foreground">
                  {tool.status === 'running' ? (
                    <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-amber-400" />
                  ) : isFailed(tool) ? (
                    <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
                  ) : (
                    <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="font-mono text-violet-600 dark:text-violet-300">{formatToolDisplayName(tool.name)}</span>
                    {tool.status === 'running' ? (
                      <span className="ml-2 text-amber-600 dark:text-amber-400/90">{c.toolRunning}</span>
                    ) : isFailed(tool) ? (
                      <span className="ml-2 block font-sans text-red-600 dark:text-red-300/90">
                        {String(tool.result?.error)}
                      </span>
                    ) : (
                      <span className="ml-2 text-emerald-600 dark:text-emerald-400/90">{c.toolDone}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}
