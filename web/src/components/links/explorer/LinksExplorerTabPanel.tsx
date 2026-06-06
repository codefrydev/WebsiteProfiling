import type { ReactNode } from 'react';
import type { LinksExplorerTabId } from './types';

interface LinksExplorerTabPanelProps {
  tabId: LinksExplorerTabId;
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
