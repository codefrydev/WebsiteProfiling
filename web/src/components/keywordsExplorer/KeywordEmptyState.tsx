'use client';

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
      <Icon className="h-10 w-10 text-muted-foreground/40 mb-3" aria-hidden />
      <p className="text-sm font-medium text-foreground mb-1">{title}</p>
      <p className="text-xs text-muted-foreground max-w-sm leading-relaxed">{description}</p>
      {hint && <p className="text-[11px] text-muted-foreground/80 mt-2 max-w-xs">{hint}</p>}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-4 px-3 py-2 text-sm font-medium rounded-lg border border-default bg-brand-900 hover:bg-brand-800 text-foreground transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
