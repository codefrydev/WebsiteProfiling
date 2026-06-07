'use client';

import { useEffect, useRef } from 'react';
import { Sparkles, User } from 'lucide-react';
import ChatToolActivity, { type ToolActivityItem } from './ChatToolActivity';
import { strings } from '@/lib/strings';

const c = strings.components.chat;

export interface ChatMessage {
  id: string | number;
  role: 'user' | 'assistant';
  content: string;
  toolActivity?: ToolActivityItem[];
  streaming?: boolean;
}

export interface ChatMessageListProps {
  messages: ChatMessage[];
  empty?: boolean;
}

function renderMarkdownLite(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br />');
}

export default function ChatMessageList({ messages, empty }: ChatMessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (empty) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center text-muted-foreground">
        <Sparkles className="h-10 w-10 text-violet-400/60" />
        <p className="max-w-md text-sm">{c.emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-4">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          {msg.role === 'assistant' ? (
            <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/20 text-violet-300">
              <Sparkles className="h-4 w-4" />
            </div>
          ) : null}
          <div
            className={`max-w-[85%] space-y-2 rounded-xl px-4 py-3 text-sm ${
              msg.role === 'user'
                ? 'bg-blue-600/20 text-foreground'
                : 'border border-default bg-brand-800/80 text-foreground'
            }`}
          >
            {msg.toolActivity?.length ? (
              <ChatToolActivity items={msg.toolActivity} />
            ) : null}
            {msg.content ? (
              <div
                className="prose-chat leading-relaxed"
                dangerouslySetInnerHTML={{ __html: renderMarkdownLite(msg.content) }}
              />
            ) : msg.streaming ? (
              <span className="text-muted-foreground">{c.thinking}</span>
            ) : null}
          </div>
          {msg.role === 'user' ? (
            <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/20 text-blue-300">
              <User className="h-4 w-4" />
            </div>
          ) : null}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
