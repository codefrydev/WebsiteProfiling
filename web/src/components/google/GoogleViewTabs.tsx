'use client';

import ViewTabs from '../ViewTabs';

interface LegacyGoogleViewTabsProps {
  tabs: string[];
  activeTab: string;
  onChange: (tab: string) => void;
  badges?: Record<string, number | null>;
  labels?: Record<string, string>;
}

/** @deprecated Use ViewTabs from @/components */
export default function GoogleViewTabs({
  tabs: tabIds,
  activeTab,
  onChange,
  badges = {},
  labels = {},
}: LegacyGoogleViewTabsProps) {
  const tabs = tabIds.map((id) => ({
    id,
    label: labels[id] || id,
    badge: badges[id] ?? null,
  }));

  return (
    <ViewTabs
      tabs={tabs}
      activeTab={activeTab}
      onChange={onChange}
      ariaLabel="Tabs"
    />
  );
}
