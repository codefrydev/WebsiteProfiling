'use client';

import { X } from 'lucide-react';
import type { Filter, FilterOp, FieldDef } from '@/lib/dashboard/engine/types';
import { opsForRole } from '@/lib/dashboard/builder/specEdits';

const OP_LABELS: Record<FilterOp, string> = {
  eq: '=', neq: '≠', in: 'is any of', nin: 'is none of', contains: 'contains',
  gt: '>', gte: '≥', lt: '<', lte: '≤', between: 'between',
};

interface FilterEditorProps {
  filter: Filter;
  field?: FieldDef;
  options: string[];
  onChange: (patch: Partial<Filter>) => void;
  onRemove: () => void;
}

export function FilterEditor({ filter, field, options, onChange, onRemove }: FilterEditorProps) {
  const role = field?.role ?? 'dimension';
  const ops = opsForRole(role);
  const between = filter.op === 'between';
  const tuple = Array.isArray(filter.value) ? filter.value : [];

  return (
    <div className="w-full rounded-md border border-default bg-brand-800/60 p-1.5 space-y-1">
      <div className="flex items-center gap-1">
        <span className="text-xs font-medium text-bright truncate flex-1" title={field?.key}>{field?.label ?? filter.field}</span>
        <select
          value={filter.op}
          onChange={(e) => onChange({ op: e.target.value as FilterOp })}
          className="text-[11px] bg-brand-900 border border-default rounded px-1 py-0.5 text-muted-foreground focus:outline-none"
        >
          {ops.map((op) => <option key={op} value={op}>{OP_LABELS[op]}</option>)}
        </select>
        <button onClick={onRemove} title="Remove filter" className="p-0.5 rounded hover:bg-red-500/20 hover:text-red-400 text-muted-foreground">
          <X className="h-3 w-3" />
        </button>
      </div>

      {(filter.op === 'in' || filter.op === 'nin') && (
        <select
          multiple
          value={(Array.isArray(filter.value) ? filter.value : []).map(String)}
          onChange={(e) => onChange({ value: Array.from(e.target.selectedOptions).map((o) => o.value) })}
          className="w-full text-xs bg-brand-900 border border-default rounded px-1 py-0.5 text-bright focus:outline-none h-20"
        >
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      )}

      {(filter.op === 'eq' || filter.op === 'neq') &&
        (options.length ? (
          <select
            value={String(filter.value ?? '')}
            onChange={(e) => onChange({ value: e.target.value })}
            className="w-full text-xs bg-brand-900 border border-default rounded px-1 py-0.5 text-bright focus:outline-none"
          >
            <option value="">—</option>
            {options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : (
          <input
            type="text"
            value={String(filter.value ?? '')}
            onChange={(e) => onChange({ value: e.target.value })}
            className="w-full text-xs bg-brand-900 border border-default rounded px-1 py-0.5 text-bright focus:outline-none"
          />
        ))}

      {filter.op === 'contains' && (
        <input
          type="text"
          value={String(filter.value ?? '')}
          onChange={(e) => onChange({ value: e.target.value })}
          placeholder="substring…"
          className="w-full text-xs bg-brand-900 border border-default rounded px-1 py-0.5 text-bright focus:outline-none"
        />
      )}

      {(filter.op === 'gt' || filter.op === 'gte' || filter.op === 'lt' || filter.op === 'lte') && (
        <input
          type="number"
          value={typeof filter.value === 'number' ? filter.value : ''}
          onChange={(e) => onChange({ value: Number(e.target.value) })}
          className="w-full text-xs bg-brand-900 border border-default rounded px-1 py-0.5 text-bright focus:outline-none"
        />
      )}

      {between && (
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={typeof tuple[0] === 'number' ? (tuple[0] as number) : ''}
            onChange={(e) => onChange({ value: [Number(e.target.value), Number(tuple[1] ?? 0)] })}
            className="w-full text-xs bg-brand-900 border border-default rounded px-1 py-0.5 text-bright focus:outline-none"
          />
          <span className="text-muted-foreground text-xs">–</span>
          <input
            type="number"
            value={typeof tuple[1] === 'number' ? (tuple[1] as number) : ''}
            onChange={(e) => onChange({ value: [Number(tuple[0] ?? 0), Number(e.target.value)] })}
            className="w-full text-xs bg-brand-900 border border-default rounded px-1 py-0.5 text-bright focus:outline-none"
          />
        </div>
      )}
    </div>
  );
}
