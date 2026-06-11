'use client';

import Sparkline from '@/components/Sparkline';

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
  return (
    <Sparkline
      values={scores}
      width={width}
      height={height}
      mode="higher-better"
      className={className}
    />
  );
}
