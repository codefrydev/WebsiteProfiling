
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
      className={`flex gap-1 w-full max-w-full min-w-0 overflow-x-auto flex-nowrap touch-pan-x overscroll-x-contain pb-1 ${className}`.trim()}
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
            className={`press px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ease-out active:scale-[0.98] flex items-center gap-2 whitespace-nowrap shrink-0 border ${
              isActive
                ? 'tab-active bg-md-sys-secondary-container border-transparent text-md-sys-on-secondary-container font-semibold shadow-xs'
                : 'border-transparent text-md-sys-on-surface-variant hover:text-md-sys-on-surface hover:bg-md-sys-surface-container-high/60'
            }`}
          >
            {tab.icon}
            {tab.label}
            {badge != null && badge > 0 ? (
              <span className="bg-md-sys-tertiary text-md-sys-on-tertiary text-xs px-2 py-0.5 rounded-full font-semibold tabular-nums leading-none">
                {badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
