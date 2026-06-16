'use client';

import { useId } from 'react';

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

  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const coords = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * 100;
      const y = 100 - ((p - min) / range) * 100;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg
      viewBox="0 0 100 32"
      className={`${heightClass} w-full ${className}`.trim()}
      preserveAspectRatio="none"
      aria-hidden
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={strokeClassName}
        points={coords}
      />
      <polyline fill={`url(#${fillId})`} stroke="none" points={`0,32 ${coords} 100,32`} />
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(59 130 246 / 0.25)" />
          <stop offset="100%" stopColor="rgb(59 130 246 / 0)" />
        </linearGradient>
      </defs>
    </svg>
  );
}
