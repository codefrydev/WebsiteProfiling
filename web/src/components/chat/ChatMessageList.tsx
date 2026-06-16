'use client';

import { useEffect, useRef } from 'react';
import ChatAssistantMessage from '@/components/chat/ChatAssistantMessage';
import type { ToolActivityItem } from '@/components/chat/ChatToolActivity';
import { toolEventsToActivity } from '@/components/chat/deriveChatBlocks';

export interface ChatMessage {
  id: string | number;
  role: 'user' | 'assistant';
  content: string;
  toolActivity?: ToolActivityItem[];
  streaming?: boolean;
  error?: boolean;
  partialError?: boolean;
  agentError?: string | null;
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
            {msg.role === 'user' ? (
              <div className="max-w-[90%] rounded-2xl bg-brand-700/50 px-4 py-2.5 text-sm leading-relaxed text-foreground">
                <p>{msg.content}</p>
              </div>
            ) : (
              <div className="w-full max-w-full">
                <ChatAssistantMessage
                  content={msg.content}
                  toolActivity={msg.toolActivity}
                  streaming={msg.streaming}
                  error={msg.error}
                  partialError={msg.partialError}
                  agentError={msg.agentError}
                  statusText={msg.statusText}
                />
              </div>
            )}
          </div>
        ))}
        <div aria-hidden className="h-px" />
      </div>
    </div>
  );
}

export function toolResultToActivity(
  toolResult: Record<string, unknown> | null | undefined,
): ToolActivityItem[] {
  return toolEventsToActivity(toolResult);
}

export function agentErrorFromToolResult(
  toolResult: Record<string, unknown> | null | undefined,
): string | null {
  if (!toolResult) return null;
  const err = toolResult.agent_error;
  return typeof err === 'string' && err.trim() ? err.trim() : null;
}
