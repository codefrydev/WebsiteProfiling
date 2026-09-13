import type { ReactNode } from 'react';
import { getBadgeVariant } from '../lib/badges';

/**
 * Unified severity/priority/status badge. Variants: critical, high, medium, low, info, success.
 * Single size: text-xs, py-1, px-2. Normalize display value via optional `label` prop.
 */
const VARIANT_CLASSES: Record<string, string> = {
  critical: 'bg-md-sys-error text-md-sys-on-error shadow-xs',
  high: 'bg-md-sys-error-container text-md-sys-on-error-container border border-md-sys-error/30',
  medium: 'bg-md-sys-tertiary-container text-md-sys-on-tertiary-container border border-md-sys-tertiary/30',
  low: 'bg-md-sys-secondary-container text-md-sys-on-secondary-container border border-md-sys-outline-variant/40',
  info: 'bg-md-sys-primary-container text-md-sys-on-primary-container border border-md-sys-primary/30',
  success: 'bg-md-sys-success-container text-md-sys-on-success-container border border-md-sys-success/30',
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
      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold tracking-wide uppercase ${classes} ${className}`.trim()}
      {...(live ? { role: 'status' as const, 'aria-live': 'polite' as const } : {})}
    >
      {display}
    </span>
  );
}
