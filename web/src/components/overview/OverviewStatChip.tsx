import type { ReactNode } from 'react';

export interface OverviewStatChipProps {
  icon: ReactNode;
  iconWrapClassName: string;
  label: string;
  value: string;
  valueClassName?: string;
  className?: string;
}

/** Bento-style KPI chip: colored icon badge + label on the left, bold value on the right. */
export function OverviewStatChip({
  icon,
  iconWrapClassName,
  label,
  value,
  valueClassName = 'text-bright',
  className = '',
}: OverviewStatChipProps) {
  return (
    <div
      className={`flex flex-1 items-center justify-between gap-3 rounded-[1.75rem] border border-default/60 bg-brand-900/40 p-5 shadow-sm ${className}`.trim()}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconWrapClassName}`}>
          {icon}
        </div>
        <span className="min-w-0 truncate text-sm font-medium text-muted-foreground">{label}</span>
      </div>
      <span className={`shrink-0 text-3xl font-extrabold tabular-nums ${valueClassName}`}>{value}</span>
    </div>
  );
}
