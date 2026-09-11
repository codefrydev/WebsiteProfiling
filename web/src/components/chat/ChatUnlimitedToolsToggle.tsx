
import { Infinity } from 'lucide-react';
import { strings } from '@/lib/strings';
import { parseLlmBool } from '@/lib/llmConfigSchema';
import { usePipeline } from '@/context/PipelineContext';

const c = strings.components.chat;

export interface ChatUnlimitedToolsToggleProps {
  disabled?: boolean;
}

export default function ChatUnlimitedToolsToggle({ disabled }: ChatUnlimitedToolsToggleProps) {
  const { llmConfigState, saveLlmChatUnlimitedTools, saving } = usePipeline();
  const enabled = parseLlmBool(llmConfigState.llm_chat_unlimited_tool_rounds);
  const busy = disabled || saving;

  return (
    <button
      type="button"
      disabled={busy}
      title={enabled ? c.unlimitedToolsOnHint : c.unlimitedToolsOffHint}
      aria-pressed={enabled}
      aria-label={enabled ? c.unlimitedToolsOnLabel : c.unlimitedToolsOffLabel}
      onClick={() => void saveLlmChatUnlimitedTools(!enabled)}
      className={`press flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-xs transition-colors active:scale-[0.98] disabled:opacity-50 ${
        enabled
          ? 'bg-md-sys-primary-container text-md-sys-on-primary-container hover:brightness-105'
          : 'text-md-sys-on-surface-variant hover:bg-md-sys-surface-container-high hover:text-md-sys-on-surface'
      }`}
    >
      <Infinity className="h-3.5 w-3.5 shrink-0" />
      <span className="hidden font-medium sm:inline">{c.unlimitedToolsShort}</span>
    </button>
  );
}
