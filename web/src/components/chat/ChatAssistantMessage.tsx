'use client';

import { Sparkles } from 'lucide-react';
import ChatBlocks from '@/components/chat/blocks/ChatBlocks';
import ChatInsightSections from '@/components/chat/ChatInsightSections';
import ChatToolActivity, { type ToolActivityItem } from '@/components/chat/ChatToolActivity';
import { preprocessChatMarkdown } from '@/components/chat/preprocessChatMarkdown';
import { postprocessChatContent } from '@/components/chat/postprocessChatContent';
import { sanitizeChatProse } from '@/components/chat/sanitizeChatProse';
import type { ChatBlock } from '@/components/chat/deriveChatBlocks';
import { strings } from '@/lib/strings';

const c = strings.components.chat;

export interface ChatAssistantMessageProps {
  content: string;
  toolActivity?: ToolActivityItem[];
  blocks?: ChatBlock[];
  streaming?: boolean;
  error?: boolean;
  partialError?: boolean;
  agentError?: string | null;
  statusText?: string;
}

export default function ChatAssistantMessage({
  content,
  toolActivity,
  blocks: blocksOverride,
  streaming,
  error,
  partialError,
  agentError,
  statusText,
}: ChatAssistantMessageProps) {
  const processed = postprocessChatContent(content, toolActivity, {
    agentError,
    partialError,
  });
  const blocks = blocksOverride ?? processed.blocks;
  const prose = processed.prose;
  const showProse = prose.trim() && !processed.proseHidden;
  const fatalError = Boolean(error && !partialError && !processed.hasPartialError);
  const showPartialNote = processed.hasPartialError || partialError;

  const cardClass = fatalError
    ? 'chat-assistant-card border-red-500/30 bg-red-500/10'
    : showPartialNote
      ? 'chat-assistant-card chat-assistant-card-partial'
      : 'chat-assistant-card';

  const hasBody =
    blocks.length > 0 ||
    showProse ||
    (toolActivity?.length ?? 0) > 0 ||
    streaming ||
    statusText;

  if (!hasBody && fatalError) {
    return (
      <div className={`${cardClass} rounded-xl border px-4 py-2.5 text-sm text-red-200`}>
        {content || c.responseFailed}
      </div>
    );
  }

  return (
    <div className={`${cardClass} space-y-3 rounded-xl border p-4 text-sm leading-relaxed`}>
      {(streaming || (!content && !blocks.length)) && !fatalError ? (
        <Sparkles
          className={`h-4 w-4 text-muted-foreground ${streaming ? 'animate-pulse' : ''}`}
          aria-hidden
        />
      ) : null}

      {toolActivity?.length ? <ChatToolActivity items={toolActivity} /> : null}

      {blocks.length > 0 ? <ChatBlocks blocks={blocks} /> : null}

      {processed.proseHidden && blocks.length > 0 ? (
        <p className="text-xs text-muted-foreground">{c.proseStrippedNote}</p>
      ) : null}

      {showPartialNote ? (
        <p className="text-xs text-amber-200/90">{c.partialResponseNote}</p>
      ) : null}

      {showProse ? (
        streaming && !prose.includes('###') ? (
          <p className="whitespace-pre-wrap text-muted-foreground">{prose}</p>
        ) : (
          <ChatInsightSections content={prose} streaming={streaming} />
        )
      ) : content.trim() && !blocks.length ? (
        <ChatInsightSections
          content={sanitizeChatProse(preprocessChatMarkdown(content))}
          streaming={streaming}
        />
      ) : streaming && statusText ? (
        <span className="text-muted-foreground">{statusText}</span>
      ) : null}
    </div>
  );
}
