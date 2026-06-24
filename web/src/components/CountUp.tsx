
import { useCountUp } from '@/hooks/useCountUp';

export interface CountUpProps {
  value: number;
  durationMs?: number;
  /** Custom formatter for the (rounded) display value. Defaults to locale string. */
  format?: (n: number) => string;
  className?: string;
}

/** Renders a number that animates up to `value` (respects prefers-reduced-motion). */
export default function CountUp({ value, durationMs, format, className }: CountUpProps) {
  const animated = useCountUp(value, durationMs);
  const rounded = Math.round(animated);
  const display = format ? format(rounded) : rounded.toLocaleString();
  return <span className={className}>{display}</span>;
}
