import type { ReactNode } from 'react';

interface LinksExplorerTabPanelProps {
  tabId: 'urls';
  className?: string;
  children: ReactNode;
}

export function LinksExplorerTabPanel({ tabId, className, children }: LinksExplorerTabPanelProps) {
  return (
    <div
      id={`links-explorer-tab-${tabId}`}
      role="tabpanel"
      aria-labelledby={`links-explorer-tab-btn-${tabId}`}
      className={className}
    >
      {children}
    </div>
  );
}
