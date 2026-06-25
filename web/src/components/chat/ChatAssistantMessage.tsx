
import { useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import ChatStreamingStatus from '@/components/chat/ChatStreamingStatus';
import ChatBlocks from '@/components/chat/blocks/ChatBlocks';
import ChatInsightSections from '@/components/chat/ChatInsightSections';
import ChatNarrativeSections from '@/components/chat/ChatNarrativeSections';
import ChatToolActivity, { type ToolActivityItem } from '@/components/chat/ChatToolActivity';
import { preprocessChatMarkdown } from '@/components/chat/preprocessChatMarkdown';
import { postprocessChatContent } from '@/components/chat/postprocessChatContent';
import { sanitizeChatProse } from '@/components/chat/sanitizeChatProse';
import type { ChatBlock } from '@/components/chat/deriveChatBlocks';
import type { ChatNarrative } from '@/types/chatNarrative';
import { strings } from '@/lib/strings';

const c = strings.components.chat;

export interface ChatAssistantMessageProps {
  content: string;
  narrative?: ChatNarrative;
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
  narrative,
  toolActivity,
  blocks: blocksOverride,
  streaming,
  error,
  partialError,
  agentError,
  statusText,
}: ChatAssistantMessageProps) {
  const useStructuredNarrative = Boolean(narrative);

  const processed = useMemo(
    () =>
      postprocessChatContent(
        useStructuredNarrative ? '' : content,
        toolActivity,
        {
          agentError,
          partialError: useStructuredNarrative ? false : partialError,
        },
      ),
    [content, toolActivity, agentError, partialError, useStructuredNarrative],
  );
  const blocks = blocksOverride ?? processed.blocks;
  const prose = processed.prose;
  const showProse = !useStructuredNarrative && prose.trim() && !processed.proseHidden;
  const fatalError = Boolean(error && !partialError && !processed.hasPartialError);
  const showPartialNote = processed.hasPartialError || partialError;
  const showNarrative = Boolean(
    narrative &&
      (narrative.power_insights.length > 0 || narrative.recommended_actions.length > 0),
  );

  const cardClass = fatalError
    ? 'chat-assistant-card border-red-500/30 bg-red-500/10'
    : showPartialNote
      ? 'chat-assistant-card chat-assistant-card-partial'
      : 'chat-assistant-card';

  const hasBody =
    blocks.length > 0 ||
    showNarrative ||
    showProse ||
    (toolActivity?.length ?? 0) > 0 ||
    streaming ||
    statusText;

  if (!hasBody && fatalError) {
    return (
      <div className={`${cardClass} rounded-xl border px-4 py-2.5 text-sm text-red-200`}>
        {content || agentError || c.responseFailed}
      </div>
    );
  }

  const showStreamingPanel =
    streaming &&
    !fatalError &&
    !showNarrative &&
    !showProse &&
    blocks.length === 0 &&
    Boolean(statusText || (toolActivity?.length ?? 0) > 0);

  return (
    <div className={`${cardClass} space-y-3 rounded-xl border p-4 text-sm leading-relaxed`}>
      {showStreamingPanel ? (
        <ChatStreamingStatus statusText={statusText} toolActivity={toolActivity} />
      ) : (streaming || (!content && !blocks.length && !showNarrative)) && !fatalError ? (
        <Sparkles
          className={`h-4 w-4 text-muted-foreground ${streaming ? 'animate-pulse' : ''}`}
          aria-hidden
        />
      ) : null}

      {toolActivity?.length && !showStreamingPanel ? (
        <ChatToolActivity items={toolActivity} streaming={streaming} />
      ) : null}

      {blocks.length > 0 ? <ChatBlocks blocks={blocks} /> : null}

      {processed.proseHidden && blocks.length > 0 ? (
        <p className="text-xs text-muted-foreground">{c.proseStrippedNote}</p>
      ) : null}

      {showPartialNote ? (
        <p className="text-xs text-amber-200/90">{c.partialResponseNote}</p>
      ) : null}

      {showNarrative && narrative ? (
        <ChatNarrativeSections narrative={narrative} streaming={streaming} />
      ) : null}

      {showProse ? (
        streaming && !prose.includes('###') ? (
          <p className="whitespace-pre-wrap text-muted-foreground">{prose}</p>
        ) : (
          <ChatInsightSections content={prose} streaming={streaming} />
        )
      ) : !useStructuredNarrative && content.trim() && !blocks.length ? (
        <ChatInsightSections
          content={sanitizeChatProse(preprocessChatMarkdown(content))}
          streaming={streaming}
        />
      ) : streaming && statusText ? (
        <ChatStreamingStatus statusText={statusText} toolActivity={toolActivity} />
      ) : null}
    </div>
  );
}
