
import { useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import CountUp from '@/components/CountUp';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { strings, format } from '@/lib/strings';

export interface AnchorStat {
  anchor: string;
  count: number;
}

export interface ConnectionInsightsProps {
  inboundCount: number;
  outboundCount: number;
  topAnchors: AnchorStat[];
}

/** Triggers a one-shot mount flag on the next frame (so width transitions animate in). */
function useMountFlag(reduced: boolean): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (reduced) {
      setMounted(true);
      return;
    }
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, [reduced]);
  return mounted;
}

function AnchorBar({ anchor, count, max, index }: { anchor: string; count: number; max: number; index: number }) {
  const reduced = usePrefersReducedMotion();
  const mounted = useMountFlag(reduced);
  const pct = max > 0 ? Math.max(4, (count / max) * 100) : 0;
  const label = anchor || '—';
  return (
    <li className="space-y-0.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="truncate text-md-sys-on-surface" title={label}>
          {label}
        </span>
        <span className="shrink-0 font-mono tabular-nums text-md-sys-on-surface-variant">
          <CountUp value={count} />
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-md-sys-surface-container">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-500/80 to-blue-500/80"
          style={{
            width: mounted ? `${pct}%` : '0%',
            transition: reduced ? 'none' : `width 600ms var(--ease-out) ${index * 70}ms`,
          }}
        />
      </div>
    </li>
  );
}

function StatTile({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-md-sys-outline-variant/40 bg-md-sys-surface-container-low px-3 py-2.5">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${accent}`}>{icon}</span>
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-wider text-md-sys-on-surface-variant">{label}</div>
        <div className="text-xl font-bold tabular-nums text-md-sys-on-surface">
          <CountUp value={value} />
        </div>
      </div>
    </div>
  );
}

export default function ConnectionInsights({ inboundCount, outboundCount, topAnchors }: ConnectionInsightsProps) {
  const ct = strings.components.connectionsTab;
  const reduced = usePrefersReducedMotion();
  const mounted = useMountFlag(reduced);

  const total = inboundCount + outboundCount;
  const inPct = total > 0 ? (inboundCount / total) * 100 : 50;
  const maxAnchor = topAnchors.reduce((m, a) => Math.max(m, a.count), 0);

  return (
    <div className="rounded-xl border border-md-sys-outline-variant/40 bg-md-sys-surface-container/40 p-4">
      <h3 className="mb-3 text-sm font-semibold text-md-sys-on-surface">{ct.insightsTitle}</h3>

      <div className="grid grid-cols-2 gap-3">
        <StatTile
          label={ct.inboundShort}
          value={inboundCount}
          accent="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
          icon={<ArrowDownLeft className="h-4 w-4" />}
        />
        <StatTile
          label={ct.outboundShort}
          value={outboundCount}
          accent="bg-blue-500/15 text-blue-600 dark:text-blue-400"
          icon={<ArrowUpRight className="h-4 w-4" />}
        />
      </div>

      {total > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-md-sys-on-surface-variant">
            {ct.balanceTitle}
          </div>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-md-sys-surface-container">
            <div
              className="h-full bg-emerald-500/80"
              style={{
                width: mounted ? `${inPct}%` : '0%',
                transition: reduced ? 'none' : 'width 700ms var(--ease-out)',
              }}
            />
            <div
              className="h-full bg-blue-500/80"
              style={{
                width: mounted ? `${100 - inPct}%` : '0%',
                transition: reduced ? 'none' : 'width 700ms var(--ease-out)',
              }}
            />
          </div>
        </div>
      )}

      <div className="mt-4">
        <div className="text-sm font-semibold text-md-sys-on-surface">{ct.anchorsTitle}</div>
        <p className="mb-2 text-xs text-md-sys-on-surface-variant">{ct.anchorsHint}</p>
        {topAnchors.length === 0 ? (
          <p className="text-xs text-md-sys-on-surface-variant">{ct.noAnchors}</p>
        ) : (
          <ul className="space-y-2">
            {topAnchors.map((a, i) => (
              <AnchorBar key={`${a.anchor}-${i}`} anchor={a.anchor} count={a.count} max={maxAnchor} index={i} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
