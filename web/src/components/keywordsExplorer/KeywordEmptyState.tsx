
import type { LucideIcon } from 'lucide-react';
import { Filter } from 'lucide-react';

export interface KeywordEmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
  hint?: string;
}

export default function KeywordEmptyState({
  icon: Icon = Filter,
  title,
  description,
  action,
  hint,
}: KeywordEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <Icon className="h-10 w-10 text-md-sys-on-surface-variant/40 mb-3" aria-hidden />
      <p className="text-sm font-medium text-md-sys-on-surface mb-1">{title}</p>
      <p className="text-xs text-md-sys-on-surface-variant max-w-sm leading-relaxed">{description}</p>
      {hint && <p className="text-[11px] text-md-sys-on-surface-variant/80 mt-2 max-w-xs">{hint}</p>}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-4 px-4 py-1.5 text-sm font-medium rounded-full border border-md-sys-outline-variant/50 bg-md-sys-surface-container-low hover:bg-md-sys-surface-container text-md-sys-on-surface shadow-elevation-1 active:scale-[0.98] transition-all"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
