'use client';

import type { GoogleChartCardProps } from '@/types/components';

export default function GoogleChartCard({
  title,
  hint,
  ariaLabel,
  heightClass = 'h-56',
  children,
}: GoogleChartCardProps) {
  return (
    <div className="bg-brand-800 border border-default rounded-xl p-4">
      <h3 className="text-sm font-bold text-foreground mb-1">{title}</h3>
      {hint && <p className="text-xs text-muted-foreground mb-3">{hint}</p>}
      <div className={heightClass} role="img" aria-label={ariaLabel}>
        {children}
      </div>
    </div>
  );
}
