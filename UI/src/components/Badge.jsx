import { getBadgeVariant } from '../lib/badges';

/**
 * Unified severity/priority/status badge. Variants: critical, high, medium, low, info, success.
 * Single size: text-xs, py-1, px-2. Normalize display value via optional `label` prop.
 */
const VARIANT_CLASSES = {
  critical: 'bg-red-500 text-white',
  high: 'bg-red-500/20 text-red-400 border border-red-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  low: 'bg-slate-500/20 text-slate-400 border border-slate-500/30',
  info: 'bg-slate-600/20 text-slate-500 border border-slate-600/30',
  success: 'bg-green-500/20 text-green-400 border border-green-500/30',
};

export default function Badge({ variant, value, label, className = '' }) {
  const v = variant || getBadgeVariant(value);
  const display = label != null ? label : (value != null && value !== '' ? String(value) : '—');
  const classes = VARIANT_CLASSES[v] || VARIANT_CLASSES.info;
  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded text-xs font-bold uppercase ${classes} ${className}`.trim()}
    >
      {display}
    </span>
  );
}
