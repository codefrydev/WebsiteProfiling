import type { ReactNode } from 'react';
import type { OverviewTabId } from './types';

interface OverviewTabPanelProps {
  tabId: OverviewTabId;
  className?: string;
  children: ReactNode;
}

export function OverviewTabPanel({ tabId, className, children }: OverviewTabPanelProps) {
  return (
    <div
      id={`overview-tab-${tabId}`}
      role="tabpanel"
      aria-labelledby={`overview-tab-btn-${tabId}`}
      className={className}
    >
      {children}
    </div>
  );
}
