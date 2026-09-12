
import { useMemo } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { SlicerControl } from '@/lib/dashboard/interaction/SlicerControl';
import { DATASETS } from '@/lib/dashboard/engine/datasets';
import type { BoardSlicer } from '@/lib/dashboard/engine/doc';
import type { FilterValue } from '@/lib/dashboard/engine/types';
import type { CrossFilter } from '@/lib/dashboard/interaction/applyInteractions';

interface SlicerBarProps {
  slicers: BoardSlicer[];
  slicerValues: Record<string, FilterValue>;
  crossFilter: CrossFilter | null;
  editing: boolean;
  onSetValue: (id: string, value: string[]) => void;
  onAddSlicer: (field: string, datasetId: string, label: string) => void;
  onRemoveSlicer: (id: string) => void;
  onClearCrossFilter: () => void;
}

export function SlicerBar({
  slicers,
  slicerValues,
  crossFilter,
  editing,
  onSetValue,
  onAddSlicer,
  onRemoveSlicer,
  onClearCrossFilter,
}: SlicerBarProps) {
  // Distinct dimension fields across datasets, for the "add slicer" menu.
  const dimOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: { key: string; datasetId: string; label: string; group: string }[] = [];
    for (const d of DATASETS) {
      for (const f of d.fields) {
        if (f.role !== 'dimension' || seen.has(f.key)) continue;
        seen.add(f.key);
        opts.push({ key: f.key, datasetId: d.id, label: f.label, group: d.group ?? 'Other' });
      }
    }
    return opts;
  }, []);

  if (!editing && slicers.length === 0 && !crossFilter) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap px-1 py-2 border-b border-md-sys-outline-variant/40">
      <SlidersHorizontal className="h-3.5 w-3.5 text-md-sys-on-surface-variant shrink-0" />
      {slicers.map((s) => (
        <SlicerControl
          key={s.id}
          slicer={s}
          value={slicerValues[s.id]}
          editing={editing}
          onChange={(v) => onSetValue(s.id, v)}
          onRemove={() => onRemoveSlicer(s.id)}
        />
      ))}

      {editing && (
        <select
          value=""
          onChange={(e) => {
            if (!e.target.value) return;
            const opt = dimOptions.find((o) => o.key === e.target.value);
            if (opt) onAddSlicer(opt.key, opt.datasetId, opt.label);
            e.currentTarget.value = '';
          }}
          className="px-3 py-1 text-xs bg-md-sys-surface-container border border-dashed border-md-sys-outline-variant/40 rounded-full text-md-sys-on-surface-variant hover:text-md-sys-on-surface focus:outline-none cursor-pointer"
        >
          <option value="">+ Add slicer…</option>
          {dimOptions.map((o) => (
            <option key={o.key} value={o.key}>{o.label} ({o.group})</option>
          ))}
        </select>
      )}

      {crossFilter && (
        <button
          onClick={onClearCrossFilter}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-md-sys-warning-container/30 border border-md-sys-warning/30 text-md-sys-warning text-xs active:scale-[0.98] transition-all"
          title="Clear cross-filter"
        >
          {crossFilter.field} = {crossFilter.value}
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
