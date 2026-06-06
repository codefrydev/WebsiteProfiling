import type { ReactNode } from 'react';

export interface RatioBarProps {
  label: string;
  primaryLabel: string;
  secondaryLabel: string;
  primaryPct: number;
  /** Summary for screen readers */
  ariaSummary?: string;
  primaryClassName?: string;
  secondaryClassName?: string;
}

/** Two-part ratio (e.g. text vs markup) as a horizontal stacked 100% bar. */
export function RatioBar({
  label,
  primaryLabel,
  secondaryLabel,
  primaryPct,
  ariaSummary,
  primaryClassName = 'bg-green-500',
  secondaryClassName = 'bg-slate-600',
}: RatioBarProps) {
  const safePrimary = Math.min(100, Math.max(0, primaryPct));
  const safeSecondary = 100 - safePrimary;
  const summary =
    ariaSummary ??
    `${label}: ${primaryLabel} ${safePrimary.toFixed(1)}%, ${secondaryLabel} ${safeSecondary.toFixed(1)}%`;

  return (
    <div className="space-y-2" role="img" aria-label={summary}>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{label}</span>
        <span className="font-bold text-bright tabular-nums">{safePrimary.toFixed(1)}% {primaryLabel}</span>
      </div>
      <div className="flex h-3 rounded-full overflow-hidden bg-track" aria-hidden>
        <div className={`h-full ${primaryClassName}`} style={{ width: `${safePrimary}%` }} title={primaryLabel} />
        <div className={`h-full ${secondaryClassName}`} style={{ width: `${safeSecondary}%` }} title={secondaryLabel} />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground" aria-hidden>
        <span>{primaryLabel}</span>
        <span>{secondaryLabel}</span>
      </div>
      <p className="sr-only">{summary}</p>
    </div>
  );
}

export interface CoverageBarProps {
  label: ReactNode;
  pct?: number | null;
  color?: string;
}

/** Single-metric coverage progress bar (replaces 2-slice doughnuts). */
export function CoverageBar({ label, pct, color = 'text-link-soft' }: CoverageBarProps) {
  const safeP = Math.min(100, Math.max(0, pct ?? 0));
  return (
    <div className="space-y-1.5" role="img" aria-label={`${String(label)}: ${safeP}%`}>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span className="font-medium">{label}</span>
        <span className={`font-bold ${color}`}>{safeP}%</span>
      </div>
      <div className="h-2 bg-track rounded-full overflow-hidden" aria-hidden>
        <div
          className={`h-full rounded-full transition-all duration-500 ${safeP >= 80 ? 'bg-green-500' : safeP >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
          style={{ width: `${safeP}%` }}
        />
      </div>
    </div>
  );
}
