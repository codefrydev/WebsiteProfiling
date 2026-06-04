'use client';

interface PipelineSettingsSectionTabsProps {
  tabs: { id: string; label: string }[];
  activeTab: string;
  onChange: (id: string) => void;
  ariaLabel: string;
}

export default function PipelineSettingsSectionTabs({
  tabs,
  activeTab,
  onChange,
  ariaLabel,
}: PipelineSettingsSectionTabsProps) {
  return (
    <div className="border-b border-default" role="tablist" aria-label={ariaLabel}>
      <div className="flex gap-0 overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`pipe-settings-panel-${tab.id}`}
              id={`pipe-settings-tab-${tab.id}`}
              onClick={() => onChange(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                isActive
                  ? 'border-accent text-accent'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
