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
      className="rounded-2xl border border-md-sys-outline-variant/30 bg-md-sys-surface-container-low px-3 py-2.5"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-2.5">
        <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-md-sys-primary" aria-hidden />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-start gap-2">
            <p className="min-w-0 flex-1 text-sm text-md-sys-on-surface">{statusText || c.thinking}</p>
            {hasToolDetails ? (
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="press flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs text-md-sys-on-surface-variant hover:bg-md-sys-surface-container-high hover:text-md-sys-on-surface active:scale-[0.98]"
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
            <ul className="space-y-1 border-t border-md-sys-outline-variant/20 pt-1.5 text-xs">
              {toolActivity!.map((tool) => (
                <li key={tool.id} className="flex items-start gap-2 text-md-sys-on-surface-variant">
                  {tool.status === 'running' ? (
                    <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-md-sys-warning" />
                  ) : isFailed(tool) ? (
                    <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-md-sys-error" />
                  ) : (
                    <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-md-sys-success" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="font-mono text-md-sys-primary">{formatToolDisplayName(tool.name)}</span>
                    {tool.status === 'running' ? (
                      <span className="ml-2 text-md-sys-warning">{c.toolRunning}</span>
                    ) : isFailed(tool) ? (
                      <span className="ml-2 block font-sans text-md-sys-error">
                        {String(tool.result?.error)}
                      </span>
                    ) : (
                      <span className="ml-2 text-md-sys-success">{c.toolDone}</span>
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
