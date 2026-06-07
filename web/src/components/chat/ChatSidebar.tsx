'use client';

import { MessageSquarePlus, Trash2 } from 'lucide-react';
import { strings } from '@/lib/strings';
const c = strings.components.chat;

export interface ChatSessionItem {
  id: number;
  title: string;
}

export interface ChatSidebarProps {
  sessions: ChatSessionItem[];
  activeSessionId: number | null;
  onNewChat: () => void;
  onSelect: (id: number) => void;
  onDelete: (id: number) => void;
  loading?: boolean;
}

export default function ChatSidebar({
  sessions,
  activeSessionId,
  onNewChat,
  onSelect,
  onDelete,
  loading,
}: ChatSidebarProps) {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-muted bg-brand-800/50">
      <div className="border-b border-muted p-3">
        <button
          type="button"
          onClick={onNewChat}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600/90 px-3 py-2 text-sm font-medium text-white hover:bg-violet-500"
        >
          <MessageSquarePlus className="h-4 w-4" />
          {c.newChat}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading ? (
          <p className="px-2 py-4 text-xs text-muted-foreground">{c.loadingSessions}</p>
        ) : sessions.length === 0 ? (
          <p className="px-2 py-4 text-xs text-muted-foreground">{c.noSessions}</p>
        ) : (
          <ul className="space-y-1">
            {sessions.map((s) => (
              <li key={s.id} className="group flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onSelect(s.id)}
                  className={`min-w-0 flex-1 truncate rounded-lg px-3 py-2 text-left text-xs ${
                    activeSessionId === s.id
                      ? 'bg-violet-500/15 text-violet-200'
                      : 'text-muted-foreground hover:bg-brand-700/80 hover:text-foreground'
                  }`}
                  title={s.title}
                >
                  {s.title}
                </button>
                <button
                  type="button"
                  aria-label={c.deleteSession}
                  onClick={() => onDelete(s.id)}
                  className="rounded p-1.5 text-muted-foreground opacity-0 hover:text-red-400 group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
