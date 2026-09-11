
import { X } from 'lucide-react';
import type { AggOp } from '@/lib/dashboard/engine/types';

const AGG_OPTS: { value: AggOp; label: string }[] = [
  { value: 'sum', label: 'Sum' },
  { value: 'avg', label: 'Avg' },
  { value: 'count', label: 'Count' },
  { value: 'countDistinct', label: 'Count distinct' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
  { value: 'median', label: 'Median' },
];

interface ShelfPillProps {
  label: string;
  onRemove: () => void;
  agg?: AggOp;
  onAgg?: (agg: AggOp) => void;
}

export function ShelfPill({ label, onRemove, agg, onAgg }: ShelfPillProps) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-md-sys-surface-container border border-md-sys-outline-variant/40 pl-2.5 pr-1 py-0.5 text-xs text-md-sys-on-surface max-w-full">
      {agg && onAgg && (
        <select
          value={agg}
          onChange={(e) => onAgg(e.target.value as AggOp)}
          onClick={(e) => e.stopPropagation()}
          className="bg-transparent text-[10px] text-md-sys-success font-semibold focus:outline-none -ml-1 cursor-pointer"
          title="Aggregation"
        >
          {AGG_OPTS.map((o) => (
            <option key={o.value} value={o.value} className="bg-md-sys-surface-container-low text-md-sys-on-surface">{o.label}</option>
          ))}
        </select>
      )}
      <span className="truncate" title={label}>{label}</span>
      <button onClick={onRemove} title="Remove" className="press p-0.5 rounded-full hover:bg-md-sys-error-container hover:text-md-sys-on-error-container text-md-sys-on-surface-variant active:scale-95">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
