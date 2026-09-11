import type { ReactNode } from 'react';

export interface CompactWidgetProps {
  title: string;
  children: ReactNode;
  className?: string;
}

export function CompactWidget({ title, children, className = '' }: CompactWidgetProps) {
  return (
    <div className={`rounded-lg border border-md-sys-outline-variant/40 bg-md-sys-surface-container-low/40 p-2.5 ${className}`.trim()}>
      <p className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-md-sys-on-surface-variant sm:text-[10px]">
        {title}
      </p>
      {children}
    </div>
  );
}
