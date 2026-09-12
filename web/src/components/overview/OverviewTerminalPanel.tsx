import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export interface OverviewTerminalPanelProps {
  icon: ReactNode;
  iconBadgeClassName?: string;
  title: string;
  subtitle?: string;
  liveLabel: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Diagnostic-panel shell: a "screen" nested in a bezel, theme-aware (light/dark follow the app toggle). */
export function OverviewTerminalPanel({
  icon,
  iconBadgeClassName = 'border-md-sys-primary/30 bg-md-sys-primary-container/30 text-md-sys-primary',
  title,
  subtitle,
  liveLabel,
  actions,
  children,
  className = '',
}: OverviewTerminalPanelProps) {
  return (
    <div className={`w-full rounded-2xl border border-md-sys-outline-variant/40 bg-md-sys-surface-container p-1 shadow-elevation-1 ${className}`.trim()}>
      <div className="overflow-hidden rounded-xl border border-md-sys-outline-variant/30 bg-md-sys-surface-container-low">
        <div className="flex flex-col gap-4 border-b border-md-sys-outline-variant/30 bg-md-sys-surface-container-high/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${iconBadgeClassName}`}
            >
              {icon}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold tracking-tight text-md-sys-on-surface">{title}</h2>
                <span className="flex items-center gap-1.5 rounded-full border border-md-sys-success/20 bg-md-sys-success-container/20 px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-md-sys-success">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-md-sys-success" aria-hidden />
                  {liveLabel}
                </span>
              </div>
              {subtitle ? <p className="mt-0.5 font-mono text-xs text-md-sys-on-surface-variant">{subtitle}</p> : null}
            </div>
          </div>
          {actions ? (
            <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">{actions}</div>
          ) : null}
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function OverviewTerminalActionLink({
  to,
  icon,
  primary = false,
  children,
}: {
  to: string;
  icon: ReactNode;
  primary?: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className={
        primary
          ? 'group flex items-center gap-2 rounded-full bg-md-sys-primary px-4 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-md-sys-on-primary shadow-elevation-1 transition-all hover:shadow-elevation-2 active:scale-[0.98]'
          : 'group flex items-center gap-2 rounded-full border border-md-sys-outline-variant/50 bg-md-sys-surface-container-high px-4 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-md-sys-on-surface transition-all hover:bg-md-sys-surface-container-highest active:scale-[0.98]'
      }
    >
      {icon}
      {children}
    </Link>
  );
}

export type OverviewTerminalBand = 'good' | 'fair' | 'critical' | 'neutral';

const BAND_TILE_CLASSES: Record<OverviewTerminalBand, string> = {
  good: 'border-md-sys-success/30 bg-md-sys-success-container/15 text-md-sys-success',
  fair: 'border-md-sys-warning/30 bg-md-sys-warning-container/15 text-md-sys-warning',
  critical: 'border-md-sys-error/30 bg-md-sys-error-container/30 text-md-sys-error',
  neutral: 'border-md-sys-primary/30 bg-md-sys-primary-container/20 text-md-sys-primary',
};

export interface OverviewTerminalMetricTileProps {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  unit?: string;
  band?: OverviewTerminalBand;
  sub?: ReactNode;
  href?: string;
}

/** Metrics-rack tile: icon, uppercase mono label, big mono value, colored by evaluated status. */
export function OverviewTerminalMetricTile({
  icon,
  label,
  value,
  unit,
  band = 'neutral',
  sub,
  href,
}: OverviewTerminalMetricTileProps) {
  const content = (
    <div
      className={`flex h-full flex-col justify-between rounded-2xl border p-4 transition-all duration-200 active:scale-[0.99] ${BAND_TILE_CLASSES[band]}`}
    >
      <div className="mb-2 opacity-70">{icon}</div>
      <div>
        <div className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-widest opacity-70">{label}</div>
        <div className="font-mono text-2xl font-bold tracking-tight sm:text-3xl">
          {value}
          {unit ? <span className="ml-0.5 text-base opacity-50">{unit}</span> : null}
        </div>
        {sub ? <div className="mt-1 text-xs font-medium opacity-90">{sub}</div> : null}
      </div>
    </div>
  );
  if (href) {
    return (
      <Link to={href} className="block h-full">
        {content}
      </Link>
    );
  }
  return content;
}

/** LED-style segmented bar. `score` is a 0-100 relative-severity indicator, not a calibrated metric. */
export function OverviewSeverityBar({ score }: { score: number }) {
  const normalized = Math.max(0, Math.min(100, score));
  const activeSegments = Math.ceil(normalized / 10);
  const fillClass =
    normalized >= 80 ? 'bg-md-sys-error' : normalized >= 60 ? 'bg-md-sys-warning' : 'bg-md-sys-success';
  const textClass =
    normalized >= 80
      ? 'text-md-sys-error'
      : normalized >= 60
        ? 'text-md-sys-warning'
        : 'text-md-sys-success';
  return (
    <div className="flex items-center gap-[3px]">
      {Array.from({ length: 10 }, (_, i) => (
        <div
          key={i}
          className={`h-2.5 w-1.5 rounded-full transition-all duration-300 ${i < activeSegments ? fillClass : 'bg-md-sys-surface-container-highest/40'}`}
        />
      ))}
      <span className={`ml-2 font-mono text-xs font-bold ${textClass}`}>{Math.round(normalized)}</span>
    </div>
  );
}

export interface OverviewTerminalLogRowProps {
  href: string;
  label: string;
  severityScore: number;
  severityLabel: string;
}

/** Diagnostic-log row: terminal prompt + message, with a rank-based severity bar. */
export function OverviewTerminalLogRow({ href, label, severityScore, severityLabel }: OverviewTerminalLogRowProps) {
  return (
    <Link
      to={href}
      className="group flex flex-col gap-3 rounded-xl border border-transparent p-3 transition-colors hover:border-md-sys-outline-variant/40 hover:bg-md-sys-surface-container-high/60 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <span className="pt-0.5 font-mono text-xs text-md-sys-on-surface-variant">{'>_'}</span>
        <p className="text-sm font-medium text-md-sys-on-surface transition-colors group-hover:text-md-sys-primary">{label}</p>
      </div>
      <div className="ml-6 flex items-center justify-between gap-6 border-t border-md-sys-outline-variant/30 pt-2 sm:ml-0 sm:justify-end sm:border-t-0 sm:pt-0">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-widest text-md-sys-on-surface-variant">
            {severityLabel}
          </span>
          <OverviewSeverityBar score={severityScore} />
        </div>
        <ChevronRight
          className="hidden h-4 w-4 shrink-0 text-md-sys-on-surface-variant transition-colors group-hover:text-md-sys-primary sm:block"
          aria-hidden
        />
      </div>
    </Link>
  );
}
