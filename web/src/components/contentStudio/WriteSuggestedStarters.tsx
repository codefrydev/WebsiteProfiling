
import { FileSearch, FileText, Key, PenLine, Search, Sparkles } from 'lucide-react';
import { strings } from '@/lib/strings';
import type { LucideIcon } from 'lucide-react';

const vs = strings.views.contentStudio;

const STARTER_ICONS: LucideIcon[] = [PenLine, Key, FileText, Search, FileSearch, Sparkles];

export interface WriteSuggestedStartersProps {
  onSelect: (keyword: string) => void;
  disabled?: boolean;
}

export default function WriteSuggestedStarters({ onSelect, disabled }: WriteSuggestedStartersProps) {
  const starters = vs.suggestedStarters.slice(0, 6);

  return (
    <div className="mx-auto w-full max-w-3xl pt-10">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {starters.map((starter, i) => {
          const Icon = STARTER_ICONS[i % STARTER_ICONS.length];
          return (
            <button
              key={starter.keyword}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(starter.keyword)}
              className="group flex items-start gap-3 rounded-2xl border border-md-sys-outline-variant/30 bg-md-sys-surface-container/25 px-4 py-3 text-left transition-all hover:border-md-sys-outline-variant/40 hover:bg-md-sys-surface-container/60 disabled:opacity-40"
            >
              <Icon
                className="mt-0.5 h-4 w-4 shrink-0 text-md-sys-on-surface-variant transition-colors group-hover:text-md-sys-on-surface"
                aria-hidden
              />
              <span className="text-[13px] leading-snug text-md-sys-on-surface/85 group-hover:text-md-sys-on-surface">
                {starter.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
