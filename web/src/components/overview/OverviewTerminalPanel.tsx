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
  iconBadgeClassName = 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400',
  title,
  subtitle,
  liveLabel,
  actions,
  children,
  className = '',
}: OverviewTerminalPanelProps) {
  return (
    <div className={`w-full rounded-xl border border-default bg-brand-950 p-1 shadow-elevation-2 ${className}`.trim()}>
      <div className="overflow-hidden rounded-lg border border-default bg-brand-800">
        <div className="flex flex-col gap-4 border-b border-default bg-brand-950/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${iconBadgeClassName}`}
            >
              {icon}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold tracking-tight text-bright">{title}</h2>
                <span className="flex items-center gap-1.5 rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" aria-hidden />
                  {liveLabel}
                </span>
              </div>
              {subtitle ? <p className="mt-0.5 font-mono text-xs text-muted-foreground">{subtitle}</p> : null}
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
          ? 'group flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-white transition-colors hover:bg-blue-500'
          : 'group flex items-center gap-2 rounded-lg border border-default bg-brand-900/60 px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-foreground transition-colors hover:bg-brand-700/60'
      }
    >
      {icon}
      {children}
    </Link>
  );
}

export type OverviewTerminalBand = 'good' | 'fair' | 'critical' | 'neutral';

const BAND_TILE_CLASSES: Record<OverviewTerminalBand, string> = {
  good: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  fair: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  critical: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400',
  neutral: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400',
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
      className={`flex h-full flex-col justify-between rounded-lg border p-4 transition-colors ${BAND_TILE_CLASSES[band]}`}
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
    normalized >= 80 ? 'bg-rose-500' : normalized >= 60 ? 'bg-amber-500' : 'bg-emerald-500';
  const textClass =
    normalized >= 80
      ? 'text-rose-700 dark:text-rose-400'
      : normalized >= 60
        ? 'text-amber-700 dark:text-amber-400'
        : 'text-emerald-700 dark:text-emerald-400';
  return (
    <div className="flex items-center gap-[3px]">
      {Array.from({ length: 10 }, (_, i) => (
        <div
          key={i}
          className={`h-2.5 w-1.5 rounded-[1px] transition-all duration-300 ${i < activeSegments ? fillClass : 'bg-track'}`}
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
      className="group flex flex-col gap-3 rounded-lg border border-transparent p-3 transition-colors hover:border-default hover:bg-brand-900/40 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <span className="pt-0.5 font-mono text-xs text-muted-foreground">{'>_'}</span>
        <p className="text-sm font-medium text-foreground transition-colors group-hover:text-link">{label}</p>
      </div>
      <div className="ml-6 flex items-center justify-between gap-6 border-t border-default/50 pt-2 sm:ml-0 sm:justify-end sm:border-t-0 sm:pt-0">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {severityLabel}
          </span>
          <OverviewSeverityBar score={severityScore} />
        </div>
        <ChevronRight
          className="hidden h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-link sm:block"
          aria-hidden
        />
      </div>
    </Link>
  );
}
