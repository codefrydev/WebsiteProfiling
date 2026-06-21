'use client';

import { arc, pie } from 'd3-shape';
import { scaleLinear } from 'd3-scale';

export interface CompactDonutSegment {
  label: string;
  value: number;
  color: string;
}

export interface CompactDonutProps {
  segments: CompactDonutSegment[];
  centerLabel?: string;
  centerValue?: string;
  showCounts?: boolean;
  ringClassName?: string;
}

export function CompactDonut({
  segments,
  centerLabel,
  centerValue,
  showCounts = false,
  ringClassName = 'h-14 w-14',
}: CompactDonutProps) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) return null;

  const size = 56;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 2;
  const innerR = outerR * 0.62;

  const pieLayout = pie<CompactDonutSegment>().sort(null).value((d) => d.value);
  const arcGen = arc<{ startAngle: number; endAngle: number; data: CompactDonutSegment }>()
    .innerRadius(innerR)
    .outerRadius(outerR);
  const arcs = pieLayout(segments);

  const pctScale = scaleLinear().domain([0, total]).range([0, 100]);

  return (
    <div className="flex items-center gap-2">
      <div className={`relative shrink-0 ${ringClassName}`.trim()}>
        <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full" aria-hidden="true">
          <g transform={`translate(${cx},${cy})`}>
            {arcs.map((d) => (
              <path
                key={d.data.label}
                d={arcGen(d) ?? ''}
                fill={d.data.color}
                stroke="var(--background, #0f172a)"
                strokeWidth={1}
              />
            ))}
          </g>
        </svg>
        {centerLabel || centerValue ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-tight">
            {centerValue ? (
              <span className="text-xs font-bold tabular-nums text-foreground">{centerValue}</span>
            ) : null}
            {centerLabel ? (
              <span className="text-[8px] text-muted-foreground">{centerLabel}</span>
            ) : null}
          </div>
        ) : null}
      </div>
      <ul className="min-w-0 space-y-0.5 text-[10px] text-muted-foreground">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: s.color }} />
            <span className="truncate">
              {s.label}{' '}
              {showCounts
                ? `(${s.value.toLocaleString()})`
                : `(${pctScale(s.value).toFixed(1)}%)`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
