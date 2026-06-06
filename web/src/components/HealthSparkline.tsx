'use client';

interface HealthSparklineProps {
  scores: number[];
  width?: number;
  height?: number;
  className?: string;
}

export default function HealthSparkline({
  scores,
  width = 72,
  height = 20,
  className = '',
}: HealthSparklineProps) {
  const valid = scores.filter((s) => Number.isFinite(s));
  if (valid.length < 2) return null;

  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = max - min || 1;
  const points = valid.map((score, i) => {
    const x = (i / (valid.length - 1)) * width;
    const y = height - ((score - min) / range) * height;
    return `${x},${y}`;
  });

  const latest = valid[valid.length - 1];
  const stroke =
    latest >= 80 ? '#34d399' : latest >= 60 ? '#fbbf24' : '#f87171';

  return (
    <svg
      width={width}
      height={height}
      className={`inline-block ${className}`.trim()}
      aria-hidden
      role="img"
    >
      <polyline points={points.join(' ')} fill="none" stroke={stroke} strokeWidth="1.5" />
    </svg>
  );
}
