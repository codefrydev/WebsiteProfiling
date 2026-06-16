'use client';

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

export default function ChatToolActivity({ items }: ChatToolActivityProps) {
  const [open, setOpen] = useState(false);

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
              className="rounded-full border border-red-500/40 bg-red-500/15 px-2 py-0.5 text-xs text-red-200"
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
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        aria-expanded={open}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <Wrench className="h-3.5 w-3.5" />
        <span>{format(c.toolsUsedSummary, { count: items.length })}</span>
      </button>
      {open ? (
        <div className="mt-2 space-y-2 border-l border-muted/50 pl-3 text-xs">
          {groups.map(([label, groupItems]) => (
            <div key={label}>
              <p className="mb-1 font-medium text-muted-foreground">{label}</p>
              <ul className="space-y-1">
                {groupItems.map((item) => (
                  <li key={item.id} className="font-mono text-muted-foreground">
                    <span className={isFailed(item) ? 'text-red-300' : 'text-violet-300'}>
                      {item.name}
                    </span>
                    {item.status === 'running' ? (
                      <span className="ml-2 text-amber-400">{c.toolRunning}</span>
                    ) : isFailed(item) ? (
                      <span className="ml-2 block font-sans text-red-300/90">
                        {String(item.result?.error)}
                      </span>
                    ) : (
                      <span className="ml-2 text-emerald-400">{c.toolDone}</span>
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
