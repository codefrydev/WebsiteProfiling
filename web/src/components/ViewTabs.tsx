'use client';

import type { ReactNode } from 'react';

export interface ViewTabItem {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  badge?: number | null;
}

export interface ViewTabsProps {
  tabs: ViewTabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
  ariaLabel: string;
  className?: string;
  /** Prefix for tab button / panel ids (e.g. "gsc" → gsc-tab-btn-overview) */
  idPrefix?: string;
}

export default function ViewTabs({
  tabs,
  activeTab,
  onChange,
  ariaLabel,
  className = '',
  idPrefix = 'view',
}: ViewTabsProps) {
  return (
    <div
      className={`flex gap-1 w-full max-w-full min-w-0 overflow-x-auto flex-wrap sm:flex-nowrap touch-pan-x overscroll-x-contain pb-1 ${className}`.trim()}
      role="tablist"
      aria-label={ariaLabel}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const badge = tab.badge;
        const btnId = `${idPrefix}-tab-btn-${tab.id}`;
        const panelId = `${idPrefix}-tab-${tab.id}`;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={btnId}
            aria-selected={isActive}
            aria-controls={panelId}
            onClick={() => onChange(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              isActive
                ? 'bg-brand-700 text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-brand-800'
            }`}
          >
            {tab.icon}
            {tab.label}
            {badge != null && badge > 0 ? (
              <span className="bg-amber-600/80 text-white text-xs px-1.5 py-0.5 rounded-full tabular-nums leading-none">
                {badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
