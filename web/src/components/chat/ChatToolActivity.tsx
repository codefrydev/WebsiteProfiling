'use client';

import { useState } from 'react';
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

export default function ChatToolActivity({ items }: ChatToolActivityProps) {
  const [open, setOpen] = useState(false);

  if (!items.length) return null;

  return (
    <div className="text-sm">
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
        <ul className="mt-1 space-y-1 border-l border-muted/50 pl-3 text-xs">
          {items.map((item) => (
            <li key={item.id} className="font-mono text-muted-foreground">
              <span className="text-violet-300">{item.name}</span>
              {item.status === 'running' ? (
                <span className="ml-2 text-amber-400">{c.toolRunning}</span>
              ) : (
                <span className="ml-2 text-emerald-400">{c.toolDone}</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
