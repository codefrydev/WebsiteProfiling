'use client';

import { Infinity } from 'lucide-react';
import { strings } from '@/lib/strings';
import { usePipeline } from '@/context/PipelineContext';

const c = strings.components.chat;

export interface ChatUnlimitedToolsToggleProps {
  disabled?: boolean;
}

export default function ChatUnlimitedToolsToggle({ disabled }: ChatUnlimitedToolsToggleProps) {
  const { llmConfigState, saveLlmChatUnlimitedTools, saving } = usePipeline();
  const enabled = llmConfigState.llm_chat_unlimited_tool_rounds === true;
  const busy = disabled || saving;

  return (
    <button
      type="button"
      disabled={busy}
      title={enabled ? c.unlimitedToolsOnHint : c.unlimitedToolsOffHint}
      aria-pressed={enabled}
      aria-label={enabled ? c.unlimitedToolsOnLabel : c.unlimitedToolsOffLabel}
      onClick={() => void saveLlmChatUnlimitedTools(!enabled)}
      className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-1.5 text-xs transition-colors disabled:opacity-50 ${
        enabled
          ? 'bg-violet-500/20 text-violet-200 hover:bg-violet-500/30'
          : 'text-muted-foreground hover:bg-[var(--chat-surface-hover)] hover:text-foreground'
      }`}
    >
      <Infinity className="h-3.5 w-3.5 shrink-0" />
      <span className="hidden font-medium sm:inline">{c.unlimitedToolsShort}</span>
    </button>
  );
}
