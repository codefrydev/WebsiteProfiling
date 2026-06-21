'use client';

import { useRef } from 'react';
import { scaleBand, scaleLinear } from 'd3-scale';
import { useMeasureWidth } from '@/lib/viz/hooks/useMeasureWidth';

export type CompactBarChartVariant = 'default' | 'chubby';

export interface CompactBarChartProps {
  /** Heights as percentages 0–100; length determines bar count */
  heights: number[];
  /** Optional labels rendered under each bar (chubby variant) */
  labels?: string[];
  /** Optional per-bar fill colors (hex or rgb) */
  colors?: string[];
  variant?: CompactBarChartVariant;
  className?: string;
  heightClass?: string;
}

const DEFAULT_FILL = 'url(#compactBarDefaultGrad)';
const CHUBBY_MIN = 18;
const DEFAULT_MIN = 4;

export function CompactBarChart({
  heights,
  labels,
  colors,
  variant = 'default',
  className = '',
  heightClass = 'h-20',
}: CompactBarChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useMeasureWidth(containerRef);

  if (!heights.length) return null;

  const isChubby = variant === 'chubby';
  const plotHeight = isChubby ? 112 : 80;
  const minPercent = isChubby ? CHUBBY_MIN : DEFAULT_MIN;
  const barWidth = isChubby ? 48 : undefined;
  const svgWidth = isChubby
    ? Math.max(heights.length * 56, 120)
    : width > 0
      ? width
      : 200;
  const innerHeight = plotHeight - (isChubby ? 24 : 8);

  const xScale = scaleBand<string>()
    .domain(heights.map((_, i) => String(i)))
    .range([isChubby ? 8 : 4, svgWidth - (isChubby ? 8 : 4)])
    .padding(isChubby ? 0.35 : 0.15);

  const yScale = scaleLinear()
    .domain([0, 100])
    .range([innerHeight, 0]);

  const wrapperClass = isChubby
    ? `rounded-xl border border-default/50 bg-brand-950/35 px-3 py-3 ${className}`.trim()
    : `rounded-md bg-brand-950/30 px-1 pb-1 pt-2 ${heightClass} ${className}`.trim();

  return (
    <div ref={containerRef} className={wrapperClass} role="img" aria-hidden="true">
      {width > 0 || isChubby ? (
        <svg width={svgWidth} height={plotHeight} aria-hidden="true">
          <defs>
            <linearGradient id="compactBarDefaultGrad" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="rgba(37, 99, 235, 0.55)" />
              <stop offset="100%" stopColor="rgba(96, 165, 250, 0.25)" />
            </linearGradient>
            <linearGradient id="compactBarChubbyGrad" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="rgba(37, 99, 235, 0.7)" />
              <stop offset="100%" stopColor="rgba(96, 165, 250, 0.35)" />
            </linearGradient>
          </defs>
          {heights.map((h, i) => {
            const pct = Math.min(100, Math.max(minPercent, h));
            const key = String(i);
            const x = xScale(key) ?? 0;
            const bw = barWidth ?? xScale.bandwidth();
            const barH = innerHeight - yScale(pct);
            const y = yScale(pct);
            const color = colors?.[i];
            const fill = color ?? (isChubby ? 'url(#compactBarChubbyGrad)' : DEFAULT_FILL);
            const bx = isChubby ? x + (xScale.bandwidth() - bw) / 2 : x;

            return (
              <g key={key}>
                <rect
                  x={bx}
                  y={y}
                  width={bw}
                  height={Math.max(barH, 2)}
                  rx={isChubby ? 8 : 2}
                  ry={isChubby ? 8 : 2}
                  fill={color ?? fill}
                  opacity={color ? 0.9 : 1}
                />
                {isChubby && labels?.[i] ? (
                  <text
                    x={x + xScale.bandwidth() / 2}
                    y={plotHeight - 4}
                    textAnchor="middle"
                    fontSize={10}
                    fontFamily="ui-monospace, monospace"
                    fontWeight={600}
                    fill="var(--muted-foreground, #94a3b8)"
                  >
                    {labels[i]}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      ) : null}
    </div>
  );
}
