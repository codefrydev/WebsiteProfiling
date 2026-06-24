
import { useId } from 'react';
import { scaleLinear } from 'd3-scale';
import { line, area } from 'd3-shape';
import { extent } from 'd3-array';

export interface CompactAreaSparklineProps {
  points: number[];
  className?: string;
  heightClass?: string;
  strokeClassName?: string;
}

export function CompactAreaSparkline({
  points,
  className = '',
  heightClass = 'h-8',
  strokeClassName = 'text-link/70',
}: CompactAreaSparklineProps) {
  const fillId = useId();
  if (points.length < 2) return null;

  const width = 100;
  const height = 32;
  const padding = 2;

  const xScale = scaleLinear()
    .domain([0, points.length - 1])
    .range([padding, width - padding]);

  const [yMin, yMax] = extent(points) as [number, number];
  const yRange = yMax - yMin || 1;
  const yScale = scaleLinear()
    .domain([yMin, yMax])
    .range([height - padding, padding]);

  const lineGen = line<number>()
    .x((_, i) => xScale(i))
    .y((d) => yScale(d));

  const areaGen = area<number>()
    .x((_, i) => xScale(i))
    .y0(height)
    .y1((d) => yScale(d));

  const linePath = lineGen(points) ?? '';
  const areaPath = areaGen(points) ?? '';

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={`${heightClass} w-full ${className}`.trim()}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(59 130 246 / 0.25)" />
          <stop offset="100%" stopColor="rgb(59 130 246 / 0)" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${fillId})`} />
      <path
        d={linePath}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={strokeClassName}
      />
    </svg>
  );
}
