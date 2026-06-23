
import {
  AlertTriangle,
  FileSearch,
  Gauge,
  GitBranch,
  Link2,
  Search,
} from 'lucide-react';
import { strings } from '@/lib/strings';
import type { LucideIcon } from 'lucide-react';

const c = strings.components.chat;

const PROMPT_ICONS: LucideIcon[] = [
  AlertTriangle,
  Link2,
  GitBranch,
  FileSearch,
  Search,
  Gauge,
];

export interface SuggestedPromptsProps {
  onSelect: (prompt: string) => void;
  disabled?: boolean;
  crawlEnabled?: boolean;
}

export default function SuggestedPrompts({ onSelect, disabled, crawlEnabled }: SuggestedPromptsProps) {
  const crawlPrompts = (c as { suggestedCrawlPrompts?: string[] }).suggestedCrawlPrompts ?? [];
  const prompts = crawlEnabled
    ? [...crawlPrompts.slice(0, 3), ...c.suggestedPrompts.slice(0, 3)]
    : c.suggestedPrompts.slice(0, 6);

  return (
    <div className="mx-auto w-full max-w-3xl pt-10">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {prompts.map((prompt, i) => {
          const Icon = PROMPT_ICONS[i % PROMPT_ICONS.length];
          return (
            <button
              key={prompt}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(prompt)}
              className="group flex items-start gap-3 rounded-2xl border border-default/50 bg-[var(--chat-surface)]/25 px-4 py-3 text-left transition-all hover:border-default hover:bg-[var(--chat-surface)]/60 disabled:opacity-40"
            >
              <Icon
                className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
                aria-hidden
              />
              <span className="text-[13px] leading-snug text-foreground/85 group-hover:text-foreground">
                {prompt}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
