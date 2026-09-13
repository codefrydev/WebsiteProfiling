
import { useMemo, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { useDatasetRows } from '@/lib/dashboard/hooks/useWidgetQuery';
import { dotGet } from '@/lib/dashboard/engine/coerce';
import type { BoardSlicer } from '@/lib/dashboard/engine/doc';
import type { FilterValue } from '@/lib/dashboard/engine/types';

interface SlicerControlProps {
  slicer: BoardSlicer;
  value: FilterValue | undefined;
  editing: boolean;
  onChange: (value: string[]) => void;
  onRemove: () => void;
}

export function SlicerControl({ slicer, value, editing, onChange, onRemove }: SlicerControlProps) {
  const { rows } = useDatasetRows(slicer.datasetId);
  const [open, setOpen] = useState(false);
  const selected = Array.isArray(value) ? value.map(String) : [];

  const options = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const v = dotGet(r, slicer.field);
      if (v != null && v !== '') set.add(String(v));
      if (set.size > 500) break;
    }
    return [...set].sort();
  }, [rows, slicer.field]);

  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);

  return (
    <div className="relative">
      <div className="flex items-center">
        <button
          onClick={() => setOpen((o) => !o)}
          className={`press flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs transition-all active:scale-[0.98] ${
            selected.length ? 'border-md-sys-primary bg-md-sys-primary/10 text-md-sys-primary font-medium' : 'border-md-sys-outline-variant/40 text-md-sys-on-surface-variant hover:text-md-sys-on-surface hover:bg-md-sys-surface-container-high/60'
          }`}
        >
          <span className="font-medium">{slicer.label}</span>
          {selected.length > 0 && <span className="text-[10px] bg-md-sys-primary/20 text-md-sys-primary rounded-full px-1.5 font-bold">{selected.length}</span>}
          <ChevronDown className="h-3 w-3" />
        </button>
        {editing && (
          <button onClick={onRemove} title="Remove slicer" className="press ml-1 p-1 rounded-full hover:bg-md-sys-error-container text-md-sys-on-surface-variant hover:text-md-sys-on-error-container active:scale-95 transition-all">
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1.5 w-56 max-h-64 overflow-auto bg-md-sys-surface-container border border-md-sys-outline-variant/40 rounded-2xl p-2 shadow-2xl">
            <div className="flex items-center justify-between px-1 pb-1.5 mb-1 border-b border-md-sys-outline-variant/40">
              <span className="text-[10px] uppercase font-bold text-md-sys-on-surface-variant">{slicer.label}</span>
              <button onClick={() => onChange([])} className="press text-[10px] text-md-sys-primary hover:underline font-medium">Clear</button>
            </div>
            {options.length === 0 && <p className="text-xs text-md-sys-on-surface-variant px-1 py-1">No values</p>}
            {options.map((o) => (
              <label key={o} className="flex items-center gap-2 px-2 py-1 text-xs text-md-sys-on-surface hover:bg-md-sys-surface-container-high/60 rounded-full cursor-pointer transition-colors">
                <input type="checkbox" checked={selected.includes(o)} onChange={() => toggle(o)} />
                <span className="truncate" title={o}>{o}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
