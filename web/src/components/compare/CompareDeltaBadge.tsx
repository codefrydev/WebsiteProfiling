import type { CompareMetricRow } from '@/lib/reportCompare';

function formatValue(row: CompareMetricRow, value: number | null): string {
  if (value == null) return '—';
  if (row.format === 'percent') return `${Math.round(value)}%`;
  if (row.format === 'score') return String(Math.round(value));
  return value.toLocaleString();
}

export default function CompareDeltaBadge({ row }: { row: CompareMetricRow }) {
  const { delta, higherIsBetter } = row;
  if (delta == null || delta === 0) {
    return <span className="text-xs text-md-sys-on-surface-variant">No change</span>;
  }
  const improved = higherIsBetter ? delta > 0 : delta < 0;
  const sign = delta > 0 ? '+' : '';
  const display =
    row.format === 'percent' ? `${sign}${delta}%` : `${sign}${delta.toLocaleString()}`;
  const color = improved
    ? 'text-md-sys-success'
    : 'text-md-sys-error';
  return (
    <span className={`text-xs font-semibold tabular-nums ${color}`}>{display}</span>
  );
}

export function CompareMetricCard({ row }: { row: CompareMetricRow }) {
  return (
    <div className="bg-md-sys-surface-container-low/60 border border-md-sys-outline-variant/40 rounded-lg p-3 flex flex-col gap-1 min-h-[88px]">
      <div className="text-md-sys-on-surface-variant text-xs uppercase tracking-wider leading-tight">{row.label}</div>
      <div className="flex items-baseline justify-between gap-2 mt-auto">
        <span className="text-xl font-bold text-md-sys-on-surface tabular-nums">{formatValue(row, row.current)}</span>
        <CompareDeltaBadge row={row} />
      </div>
      <div className="text-[11px] text-md-sys-on-surface-variant tabular-nums">
        was {formatValue(row, row.baseline)}
      </div>
    </div>
  );
}
