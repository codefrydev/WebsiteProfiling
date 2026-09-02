import type { ReactNode } from 'react';
import { getBadgeVariant } from '../lib/badges';

/**
 * Unified severity/priority/status badge. Variants: critical, high, medium, low, info, success.
 * Single size: text-xs, py-1, px-2. Normalize display value via optional `label` prop.
 */
const VARIANT_CLASSES: Record<string, string> = {
  critical: 'bg-red-500 text-white shadow-xs',
  high: 'bg-red-500/15 text-red-700 dark:text-red-300 border border-red-500/30',
  medium: 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30',
  low: 'bg-brand-700/50 text-muted-foreground border border-default',
  info: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30',
  success: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30',
};

export default function Badge({
  variant,
  value,
  label,
  className = '',
  live = false,
}: {
  variant?: string;
  value?: string | number | null;
  label?: string;
  className?: string;
  live?: boolean;
}) {
  const v = variant || getBadgeVariant(value);
  const display = label != null ? label : (value != null && value !== '' ? String(value) : '—');
  const classes = VARIANT_CLASSES[v] || VARIANT_CLASSES.info;
  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded text-xs font-bold uppercase ${classes} ${className}`.trim()}
      {...(live ? { role: 'status' as const, 'aria-live': 'polite' as const } : {})}
    >
      {display}
    </span>
  );
}
