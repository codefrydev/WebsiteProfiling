'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Wrench } from 'lucide-react';
import { strings } from '@/lib/strings';

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
  const [open, setOpen] = useState(true);

  if (!items.length) return null;

  return (
    <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 text-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-violet-200"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <Wrench className="h-4 w-4" />
        <span>{c.toolActivityTitle}</span>
        <span className="text-xs text-muted-foreground">({items.length})</span>
      </button>
      {open ? (
        <ul className="space-y-2 border-t border-violet-500/10 px-3 py-2 text-xs">
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
