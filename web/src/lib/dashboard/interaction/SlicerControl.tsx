
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
          className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs transition-colors ${
            selected.length ? 'border-blue-500 bg-blue-500/10 text-blue-300' : 'border-default text-muted-foreground hover:text-bright'
          }`}
        >
          <span className="font-medium">{slicer.label}</span>
          {selected.length > 0 && <span className="text-[10px] bg-blue-500/20 rounded px-1">{selected.length}</span>}
          <ChevronDown className="h-3 w-3" />
        </button>
        {editing && (
          <button onClick={onRemove} title="Remove slicer" className="ml-0.5 p-0.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400">
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 w-56 max-h-64 overflow-auto bg-brand-900 border border-default rounded-lg p-1.5 shadow-2xl">
            <div className="flex items-center justify-between px-1 pb-1 mb-1 border-b border-default">
              <span className="text-[10px] uppercase font-bold text-muted-foreground">{slicer.label}</span>
              <button onClick={() => onChange([])} className="text-[10px] text-blue-400 hover:text-blue-300">Clear</button>
            </div>
            {options.length === 0 && <p className="text-xs text-muted-foreground px-1 py-1">No values</p>}
            {options.map((o) => (
              <label key={o} className="flex items-center gap-2 px-1 py-0.5 text-xs text-foreground hover:bg-white/5 rounded cursor-pointer">
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
