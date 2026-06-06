import type { ReactNode } from 'react';

interface ViewTabPanelProps {
  idPrefix: string;
  tabId: string;
  className?: string;
  children: ReactNode;
}

export function ViewTabPanel({ idPrefix, tabId, className, children }: ViewTabPanelProps) {
  return (
    <div
      id={`${idPrefix}-tab-${tabId}`}
      role="tabpanel"
      aria-labelledby={`${idPrefix}-tab-btn-${tabId}`}
      className={className}
    >
      {children}
    </div>
  );
}
