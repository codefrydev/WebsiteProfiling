
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Wrench } from 'lucide-react';
import { format, strings } from '@/lib/strings';

const c = strings.components.chat;

export interface ToolActivityItem {
  id: string;
  name: string;
  args?: Record<string, unknown>;
  result?: Record<string, unknown>;
  status: 'running' | 'done';
}

export interface ChatToolActivityProps {
  items: ToolActivityItem[];
  /** When true, expand the tool list while work is in flight. */
  streaming?: boolean;
}

const WORKFLOW_TOOLS = new Set([
  'run_insight_workflow',
  'run_technical_workflow',
  'run_keyword_workflow',
  'run_domain_agent',
]);

function isFailed(item: ToolActivityItem): boolean {
  return item.status === 'done' && Boolean(item.result && typeof item.result.error === 'string');
}

function groupLabel(name: string): string {
  if (WORKFLOW_TOOLS.has(name)) return c.toolGroupWorkflow;
  if (name.startsWith('export_')) return c.toolGroupExport;
  if (name.includes('google') || name.includes('gsc')) return c.toolGroupGsc;
  if (name.includes('lighthouse') || name.includes('image')) return c.toolGroupPerformance;
  return c.toolGroupData;
}

export default function ChatToolActivity({ items, streaming }: ChatToolActivityProps) {
  const hasRunning = items.some((i) => i.status === 'running');
  const [open, setOpen] = useState(false);
  const expanded = open || Boolean(streaming && hasRunning);

  const failed = useMemo(() => items.filter(isFailed), [items]);
  const groups = useMemo(() => {
    const map = new Map<string, ToolActivityItem[]>();
    for (const item of items) {
      const label = groupLabel(item.name);
      const list = map.get(label) ?? [];
      list.push(item);
      map.set(label, list);
    }
    return [...map.entries()];
  }, [items]);

  if (!items.length) return null;

  return (
    <div className="text-sm">
      {failed.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {failed.map((item) => (
            <span
              key={`fail-${item.id}`}
              className="rounded-full border border-md-sys-error/30 bg-md-sys-error-container/40 px-2.5 py-0.5 text-xs text-md-sys-on-error-container"
              title={String(item.result?.error || '')}
            >
              {item.name} {c.toolFailedShort}
            </span>
          ))}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="press flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs text-md-sys-on-surface-variant hover:bg-md-sys-surface-container-high hover:text-md-sys-on-surface active:scale-[0.98]"
        aria-expanded={expanded}
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <Wrench className="h-3.5 w-3.5" />
        <span>{format(c.toolsUsedSummary, { count: items.length })}</span>
      </button>
      {expanded ? (
        <div className="mt-2 space-y-2 border-l border-md-sys-outline-variant/40 pl-3 text-xs">
          {groups.map(([label, groupItems]) => (
            <div key={label}>
              <p className="mb-1 font-medium text-md-sys-on-surface-variant">{label}</p>
              <ul className="space-y-1">
                {groupItems.map((item) => (
                  <li key={item.id} className="font-mono text-md-sys-on-surface-variant">
                    <span className={isFailed(item) ? 'text-md-sys-error' : 'text-md-sys-primary'}>
                      {item.name}
                    </span>
                    {item.status === 'running' ? (
                      <span className="ml-2 text-md-sys-warning">{c.toolRunning}</span>
                    ) : isFailed(item) ? (
                      <span className="ml-2 block font-sans text-md-sys-error">
                        {String(item.result?.error)}
                      </span>
                    ) : (
                      <span className="ml-2 text-md-sys-success">{c.toolDone}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
