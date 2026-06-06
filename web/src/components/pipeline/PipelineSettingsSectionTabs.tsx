'use client';

import ViewTabs from '@/components/ViewTabs';

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
  const items = tabs.map((tab) => ({ id: tab.id, label: tab.label }));

  return (
    <ViewTabs
      tabs={items}
      activeTab={activeTab}
      onChange={onChange}
      ariaLabel={ariaLabel}
      idPrefix="pipe-settings"
    />
  );
}
