'use client';

export type SparklineMode = 'higher-better' | 'lower-better';

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  mode?: SparklineMode;
  className?: string;
}

function trendStroke(values: number[], mode: SparklineMode): string {
  if (values.length < 2) return '#94a3b8';
  const first = values[0];
  const last = values[values.length - 1];
  const delta = last - first;
  if (Math.abs(delta) < 0.5) return '#fbbf24';
  if (mode === 'higher-better') return delta > 0 ? '#34d399' : '#f87171';
  return delta < 0 ? '#34d399' : '#f87171';
}

function absoluteStroke(value: number, mode: SparklineMode): string {
  if (mode === 'lower-better') {
    if (value <= 5) return '#34d399';
    if (value <= 20) return '#fbbf24';
    return '#f87171';
  }
  if (value >= 80) return '#34d399';
  if (value >= 60) return '#fbbf24';
  return '#f87171';
}

export default function Sparkline({
  values,
  width = 88,
  height = 22,
  mode = 'higher-better',
  className = '',
}: SparklineProps) {
  const valid = values.filter((s) => Number.isFinite(s));
  if (!valid.length) return null;

  if (valid.length === 1) {
    const value = valid[0];
    const y = height / 2;
    const stroke = absoluteStroke(value, mode);
    return (
      <svg
        width={width}
        height={height}
        className={`inline-block ${className}`.trim()}
        aria-hidden
        role="img"
      >
        <line
          x1={0}
          y1={y}
          x2={width - 4}
          y2={y}
          stroke={stroke}
          strokeWidth="1.5"
          strokeDasharray="3 3"
          opacity="0.45"
        />
        <circle cx={width - 2} cy={y} r="2.5" fill={stroke} />
      </svg>
    );
  }

  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = max - min || 1;
  const points = valid.map((value, i) => {
    const x = (i / (valid.length - 1)) * width;
    const y = height - ((value - min) / range) * (height - 2) - 1;
    return { x, y };
  });
  const polyline = points.map((p) => `${p.x},${p.y}`).join(' ');
  const area = [
    `0,${height}`,
    ...points.map((p) => `${p.x},${p.y}`),
    `${width},${height}`,
  ].join(' ');

  const latest = valid[valid.length - 1];
  const stroke =
    valid.length >= 2 ? trendStroke(valid, mode) : absoluteStroke(latest, mode);
  const fillId = `spark-fill-${mode}-${width}-${height}`;

  return (
    <svg
      width={width}
      height={height}
      className={`inline-block ${className}`.trim()}
      aria-hidden
      role="img"
    >
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${fillId})`} />
      <polyline points={polyline} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="2" fill={stroke} />
    </svg>
  );
}
