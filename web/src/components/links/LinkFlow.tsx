'use client';

import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { shortPath } from '@/lib/linkGraph';
import { strings, format } from '@/lib/strings';

export interface FlowNode {
  url: string;
  color: string;
  clickable: boolean;
}

export interface LinkFlowProps {
  current: string;
  currentColor: string;
  inbound: FlowNode[];
  outbound: FlowNode[];
  inboundTotal: number;
  outboundTotal: number;
  onSelect: (url: string) => void;
}

function NodeChip({
  node,
  align,
  onSelect,
}: {
  node: FlowNode;
  align: 'left' | 'right';
  onSelect: (url: string) => void;
}) {
  const label = shortPath(node.url) || node.url;
  const inner = (
    <>
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: node.color }} aria-hidden />
      <span className="truncate font-mono text-[11px]">{label}</span>
    </>
  );
  const cls = `flex items-center gap-1.5 rounded-lg border border-default bg-brand-900 px-2 py-1.5 max-w-full ${
    align === 'right' ? 'flex-row-reverse text-right' : ''
  }`;
  if (!node.clickable) {
    return (
      <span className={`${cls} text-muted-foreground/80`} title={node.url}>
        {inner}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onSelect(node.url)}
      title={node.url}
      className={`${cls} text-foreground hover-lift press hover:border-blue-500/40 hover:text-bright transition-colors`}
    >
      {inner}
    </button>
  );
}

/** Connector positions: evenly spaced vertical centers matching `justify-around` columns. */
function yFor(index: number, count: number): number {
  if (count <= 0) return 50;
  return ((index + 0.5) / count) * 100;
}

export default function LinkFlow({
  current,
  currentColor,
  inbound,
  outbound,
  inboundTotal,
  outboundTotal,
  onSelect,
}: LinkFlowProps) {
  const lf = strings.components.linkFlow;
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(false);

  // Replay the connector draw-in whenever the centred URL changes.
  useEffect(() => {
    if (reduced) {
      setShown(true);
      return;
    }
    setShown(false);
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [current, reduced]);

  if (inbound.length === 0 && outbound.length === 0) {
    return <p className="text-sm text-muted-foreground py-6 text-center">{lf.empty}</p>;
  }

  const connector = (y1: number, y2: number, side: 'in' | 'out', i: number) => {
    const d =
      side === 'in'
        ? `M 1 ${y1} C 28 ${y1}, 22 50, 50 50`
        : `M 50 50 C 78 50, 72 ${y2}, 99 ${y2}`;
    return (
      <path
        key={`${side}-${i}`}
        d={d}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={1.2}
        strokeOpacity={0.45}
        vectorEffect="non-scaling-stroke"
        pathLength={1}
        strokeDasharray={1}
        style={{
          strokeDashoffset: shown ? 0 : 1,
          transition: reduced ? 'none' : `stroke-dashoffset 600ms var(--ease-out) ${i * 60}ms`,
        }}
      />
    );
  };

  return (
    <div className="relative">
      <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        <span>{format(lf.inbound)} {inboundTotal > 0 ? `(${inboundTotal})` : ''}</span>
        <span>{lf.title}</span>
        <span>{format(lf.outbound)} {outboundTotal > 0 ? `(${outboundTotal})` : ''}</span>
      </div>
      <div className="relative min-h-[14rem] rounded-xl border border-default bg-brand-800/40 p-3">
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden
        >
          {inbound.map((_, i) => connector(yFor(i, inbound.length), 50, 'in', i))}
          {outbound.map((_, j) => connector(50, yFor(j, outbound.length), 'out', j))}
        </svg>

        <div className="relative z-10 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch gap-2">
          <div className="flex flex-col justify-around gap-2 min-w-0">
            {inbound.length === 0 ? (
              <span className="py-4 text-center text-[11px] text-muted-foreground/50">{lf.noInbound}</span>
            ) : (
              inbound.map((n, i) => (
                <NodeChip key={`${n.url}-${i}`} node={n} align="left" onSelect={onSelect} />
              ))
            )}
          </div>

          <div className="flex items-center justify-center px-1">
            <div
              className="flex max-w-[12rem] flex-col items-center gap-1 rounded-xl border-2 px-3 py-2.5 text-center shadow-md"
              style={{ borderColor: currentColor, background: 'var(--app-bg-elevated)' }}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {lf.centerHint}
              </span>
              <span className="truncate font-mono text-xs text-bright max-w-full" title={current}>
                {shortPath(current) || current}
              </span>
            </div>
          </div>

          <div className="flex flex-col justify-around gap-2 min-w-0">
            {outbound.length === 0 ? (
              <span className="py-4 text-center text-[11px] text-muted-foreground/50">{lf.noOutbound}</span>
            ) : (
              outbound.map((n, j) => (
                <NodeChip key={`${n.url}-${j}`} node={n} align="right" onSelect={onSelect} />
              ))
            )}
          </div>
        </div>
      </div>
      <p className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
        <ArrowRight className="h-3 w-3" aria-hidden /> {strings.components.connectionsTab.drillHint}
      </p>
    </div>
  );
}
