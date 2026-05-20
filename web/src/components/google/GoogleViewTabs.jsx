'use client';

/**
 * Shared tab bar for Google data views.
 *
 * @param {{ tabs: string[], activeTab: string, onChange: (tab:string)=>void, badges?: Record<string,number|null>, labels?: Record<string,string> }} props
 */
export default function GoogleViewTabs({ tabs, activeTab, onChange, badges = {}, labels = {} }) {
  return (
    <div className="flex gap-1 flex-wrap" role="tablist">
      {tabs.map((tab) => {
        const isActive = activeTab === tab;
        const badge = badges[tab];
        const label = labels[tab] || tab;
        return (
          <button
            key={tab}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
              isActive
                ? 'bg-brand-700 text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-brand-800'
            }`}
          >
            {label}
            {badge != null && badge > 0 && (
              <span className="bg-amber-600/80 text-white text-xs px-1.5 py-0.5 rounded-full tabular-nums leading-none">
                {badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
