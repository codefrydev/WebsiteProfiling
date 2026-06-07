'use client';

import { useEffect, useRef } from 'react';
import { Sparkles } from 'lucide-react';
import ChatBlocks from '@/components/chat/blocks/ChatBlocks';
import ChatMarkdown from '@/components/chat/ChatMarkdown';
import type { ChatBlock } from '@/components/chat/deriveChatBlocks';
import { stripRedundantMarkdown } from '@/components/chat/stripRedundantMarkdown';
import ChatToolActivity, { type ToolActivityItem } from './ChatToolActivity';
import { strings } from '@/lib/strings';

const c = strings.components.chat;

export interface ChatMessage {
  id: string | number;
  role: 'user' | 'assistant';
  content: string;
  toolActivity?: ToolActivityItem[];
  blocks?: ChatBlock[];
  streaming?: boolean;
  error?: boolean;
  statusText?: string;
}

export interface ChatMessageListProps {
  messages: ChatMessage[];
  empty?: boolean;
}

export default function ChatMessageList({ messages, empty }: ChatMessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const raf = requestAnimationFrame(() => {
      node.scrollTop = node.scrollHeight;
    });
    return () => cancelAnimationFrame(raf);
  }, [messages]);

  if (empty) return null;

  return (
    <div ref={scrollRef} className="chat-messages-scroll px-4 py-6">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`w-full space-y-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'max-w-[90%] rounded-2xl bg-brand-700/50 px-4 py-2.5 text-foreground'
                  : msg.error
                    ? 'max-w-[90%] rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-red-200'
                    : 'max-w-full text-foreground'
              }`}
            >
              {msg.role === 'assistant' && (msg.streaming || !msg.content) && !msg.error ? (
                <Sparkles
                  className={`h-4 w-4 text-muted-foreground ${msg.streaming ? 'animate-pulse' : ''}`}
                  aria-hidden
                />
              ) : null}
              {msg.toolActivity?.length ? (
                <ChatToolActivity items={msg.toolActivity} />
              ) : null}
              {msg.role === 'assistant' && msg.blocks?.length ? (
                <ChatBlocks blocks={msg.blocks} />
              ) : null}
              {msg.content ? (
                msg.role === 'user' ? (
                  <p>{msg.content}</p>
                ) : msg.streaming ? (
                  <p className="whitespace-pre-wrap text-muted-foreground">{msg.content}</p>
                ) : (
                  <ChatMarkdown
                    content={
                      msg.blocks?.length
                        ? stripRedundantMarkdown(msg.content, msg.blocks)
                        : msg.content
                    }
                  />
                )
              ) : msg.streaming ? (
                <span className={msg.error ? 'text-red-200' : 'text-muted-foreground'}>
                  {msg.statusText ||
                    (msg.toolActivity?.some((t) => t.status === 'running')
                      ? c.queryingData
                      : c.thinking)}
                </span>
              ) : msg.error && !msg.content ? (
                <span className="text-red-200">{c.responseFailed}</span>
              ) : null}
            </div>
          </div>
        ))}
        <div aria-hidden className="h-px" />
      </div>
    </div>
  );
}
