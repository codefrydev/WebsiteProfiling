import type { ReactNode } from 'react';

export interface CompactWidgetProps {
  title: string;
  children: ReactNode;
  className?: string;
}

export function CompactWidget({ title, children, className = '' }: CompactWidgetProps) {
  return (
    <div className={`rounded-lg border border-default/60 bg-brand-900/40 p-2.5 ${className}`.trim()}>
      <p className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-[10px]">
        {title}
      </p>
      {children}
    </div>
  );
}
