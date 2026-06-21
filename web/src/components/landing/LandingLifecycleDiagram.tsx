'use client';

import { Bot, Code2, FileText, GitCompare, Radar, type LucideIcon } from 'lucide-react';
import { strings } from '@/lib/strings';

const vl = strings.views.landing;

export const LIFECYCLE_NODE_COUNT = 5;

/** Fixed design canvas — figure uses matching aspect-ratio so SVG and HTML align. */
export const LIFECYCLE_LAYOUT = {
  viewWidth: 560,
  viewHeight: 448,
  centerX: 280,
  centerY: 224,
  nodeRadius: 160,
  arcRadius: 94,
  nodeWidth: 110,
  nodeHeight: 70,
  orbitRadius: 122,
} as const;

export type LifecycleAccent = 'audit' | 'report' | 'mcp' | 'fix' | 'review';

export interface LifecycleNodeSpec {
  id: LifecycleAccent;
  icon: LucideIcon;
  label: string;
  hint: string;
  ariaLabel: string;
  step: number;
}

/** Node metadata for layout and tests — order is clockwise from top. */
export function getLifecycleNodes(): LifecycleNodeSpec[] {
  return [
    {
      id: 'audit',
      step: 1,
      icon: Radar,
      label: vl.lifecycleNodeAudit,
      hint: vl.lifecycleNodeAuditHint,
      ariaLabel: `${vl.lifecycleNodeAudit}: ${vl.lifecycleNodeAuditHint}`,
    },
    {
      id: 'report',
      step: 2,
      icon: FileText,
      label: vl.lifecycleNodeReport,
      hint: vl.lifecycleNodeReportHint,
      ariaLabel: `${vl.lifecycleNodeReport}: ${vl.lifecycleNodeReportHint}`,
    },
    {
      id: 'mcp',
      step: 3,
      icon: Bot,
      label: vl.lifecycleNodeMcp,
      hint: vl.lifecycleNodeMcpHint,
      ariaLabel: `${vl.lifecycleNodeMcp}: ${vl.lifecycleNodeMcpHint}`,
    },
    {
      id: 'fix',
      step: 4,
      icon: Code2,
      label: vl.lifecycleNodeFix,
      hint: vl.lifecycleNodeFixHint,
      ariaLabel: `${vl.lifecycleNodeFix}: ${vl.lifecycleNodeFixHint}`,
    },
    {
      id: 'review',
      step: 5,
      icon: GitCompare,
      label: vl.lifecycleNodeReview,
      hint: vl.lifecycleNodeReviewHint,
      ariaLabel: `${vl.lifecycleNodeReview}: ${vl.lifecycleNodeReviewHint}`,
    },
  ];
}

/** Polar positions on a true circle — first node at 12 o'clock, equal 72° spacing. */
export function getLifecycleNodePositions(
  cx: number,
  cy: number,
  radius: number,
  count = LIFECYCLE_NODE_COUNT,
): Array<{ x: number; y: number; angle: number }> {
  const step = (2 * Math.PI) / count;
  return Array.from({ length: count }, (_, index) => {
    const angle = index * step - Math.PI / 2;
    return {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
      angle,
    };
  });
}

/** Map design-canvas coordinates to percentage for HTML overlay alignment. */
export function lifecycleCoordPercent(value: number, axis: 'x' | 'y'): string {
  const total = axis === 'x' ? LIFECYCLE_LAYOUT.viewWidth : LIFECYCLE_LAYOUT.viewHeight;
  return `${(value / total) * 100}%`;
}

/** Circular arc segment between two trimmed angles (clockwise). */
export function lifecycleArcEdge(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  sweep: number,
): string {
  const endAngle = startAngle + sweep;
  const x1 = cx + radius * Math.cos(startAngle);
  const y1 = cy + radius * Math.sin(startAngle);
  const x2 = cx + radius * Math.cos(endAngle);
  const y2 = cy + radius * Math.sin(endAngle);
  const largeArc = sweep > Math.PI ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

/** Equal arc spans between node gaps on the guide ring. */
export function getLifecycleArcSegments(
  positions: Array<{ angle: number }>,
  cx: number,
  cy: number,
  arcRadius: number,
): string[] {
  const count = positions.length;
  const step = (2 * Math.PI) / count;
  const trim = step * 0.17;
  const sweep = step - trim * 2;

  return positions.map((pos) => lifecycleArcEdge(cx, cy, arcRadius, pos.angle + trim, sweep));
}

const EDGE_ACCENTS: LifecycleAccent[] = ['report', 'mcp', 'fix', 'review', 'audit'];

export default function LandingLifecycleDiagram() {
  const {
    viewWidth,
    viewHeight,
    centerX,
    centerY,
    nodeRadius,
    arcRadius,
    nodeWidth,
    nodeHeight,
    orbitRadius,
  } = LIFECYCLE_LAYOUT;

  const nodes = getLifecycleNodes();
  const positions = getLifecycleNodePositions(centerX, centerY, nodeRadius);
  const arcPaths = getLifecycleArcSegments(positions, centerX, centerY, arcRadius);
  const caption = nodes.map((node) => node.ariaLabel).join('. ');

  return (
    <figure
      className="landing-lifecycle relative mx-auto"
      style={{ aspectRatio: `${viewWidth} / ${viewHeight}` }}
      aria-labelledby="landing-lifecycle-caption"
    >
      <div className="landing-lifecycle-backdrop pointer-events-none absolute inset-0 rounded-3xl" aria-hidden />

      <svg
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
        className="landing-lifecycle-arrows absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
        focusable="false"
      >
        <defs>
          <filter id="lifecycle-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {(['audit', 'report', 'mcp', 'fix', 'review'] as const).map((accent) => (
            <marker
              key={`marker-${accent}`}
              id={`lifecycle-arrow-${accent}`}
              markerWidth="7"
              markerHeight="7"
              refX="5.5"
              refY="3.5"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path
                d="M0,0 L7,3.5 L0,7 Z"
                className={`landing-lifecycle-marker landing-lifecycle-marker--${accent}`}
              />
            </marker>
          ))}
        </defs>

        <circle
          cx={centerX}
          cy={centerY}
          r={orbitRadius}
          className="landing-lifecycle-orbit"
          fill="none"
        />

        {arcPaths.map((path, index) => {
          const accent = EDGE_ACCENTS[index]!;
          const isClosing = index === arcPaths.length - 1;
          return (
            <path
              key={`edge-${index}`}
              d={path}
              fill="none"
              filter="url(#lifecycle-glow)"
              className={`landing-lifecycle-arrow landing-lifecycle-arrow--${accent}${
                isClosing ? ' landing-lifecycle-arrow--closing' : ''
              }`}
              markerEnd={`url(#lifecycle-arrow-${accent})`}
            />
          );
        })}
      </svg>

      <div
        className="landing-lifecycle-hub pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 text-center"
        style={{
          left: lifecycleCoordPercent(centerX, 'x'),
          top: lifecycleCoordPercent(centerY, 'y'),
        }}
        aria-hidden
      >
        <span className="landing-lifecycle-hub-ring inline-flex h-14 w-14 items-center justify-center rounded-full">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/20">
            <Radar className="h-5 w-5 text-blue-400" strokeWidth={2} />
          </span>
        </span>
        <p className="landing-lifecycle-hub-label mt-2 text-[11px] font-bold uppercase tracking-[0.14em]">
          {vl.lifecycleHubLabel}
        </p>
      </div>

      {nodes.map((node, index) => {
        const { x, y } = positions[index]!;
        const Icon = node.icon;
        return (
          <div
            key={node.id}
            data-accent={node.id}
            className="landing-lifecycle-node absolute z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col justify-between rounded-2xl px-3 py-2.5"
            style={{
              width: nodeWidth,
              height: nodeHeight,
              left: lifecycleCoordPercent(x, 'x'),
              top: lifecycleCoordPercent(y, 'y'),
            }}
            role="img"
            aria-label={node.ariaLabel}
          >
            <span className="flex items-start justify-between gap-1">
              <span className="landing-lifecycle-node-icon inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
                <Icon className="h-4 w-4" strokeWidth={2.25} aria-hidden />
              </span>
              <span className="landing-lifecycle-step inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold">
                {node.step}
              </span>
            </span>
            <div className="mt-1 min-w-0">
              <p className="text-[13px] font-bold leading-tight text-foreground">{node.label}</p>
              <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{node.hint}</p>
            </div>
          </div>
        );
      })}

      <figcaption id="landing-lifecycle-caption" className="sr-only">
        {caption}
      </figcaption>
    </figure>
  );
}
