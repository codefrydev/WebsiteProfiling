'use client';

import { Sparkles } from 'lucide-react';
import { strings } from '@/lib/strings';

const c = strings.components.chat;

export interface SuggestedPromptsProps {
  onSelect: (prompt: string) => void;
  disabled?: boolean;
}

export default function SuggestedPrompts({ onSelect, disabled }: SuggestedPromptsProps) {
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 text-violet-400" />
        {c.suggestedTitle}
      </p>
      <div className="flex flex-wrap gap-2">
        {c.suggestedPrompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(prompt)}
            className="rounded-full border border-default bg-brand-800/80 px-3 py-1.5 text-xs text-foreground hover:border-violet-500/40 hover:bg-violet-500/10 disabled:opacity-40"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
