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
  valueClassName = 'text-md-sys-on-surface',
  className = '',
}: OverviewStatChipProps) {
  return (
    <div
      className={`flex flex-1 items-center justify-between gap-3 rounded-2xl border border-md-sys-outline-variant/40 bg-md-sys-surface-container p-5 transition-all duration-200 ${className}`.trim()}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${iconWrapClassName}`}>
          {icon}
        </div>
        <span className="min-w-0 truncate text-sm font-medium text-md-sys-on-surface-variant">{label}</span>
      </div>
      <span className={`shrink-0 text-3xl font-bold tabular-nums ${valueClassName}`}>{value}</span>
    </div>
  );
}
