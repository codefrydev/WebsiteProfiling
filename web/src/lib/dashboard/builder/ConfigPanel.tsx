'use client';

import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { X, Trash2, Search } from 'lucide-react';
import { useDatasetRows } from '@/lib/dashboard/hooks/useWidgetQuery';
import { getDataset } from '@/lib/dashboard/engine/datasets';
import { dotGet } from '@/lib/dashboard/engine/coerce';
import { measureLabel } from '@/lib/dashboard/engine/runQuery';
import {
  withCategory, withSeries, withMeasureAdded, withMeasureRemoved, withMeasureAgg,
  withFilterAdded, withFilterRemoved, withFilterUpdated, withSort, withTopN, defaultFilter,
} from '@/lib/dashboard/builder/specEdits';
import { FieldChip } from '@/lib/dashboard/builder/FieldChip';
import { Shelf } from '@/lib/dashboard/builder/Shelf';
import { ShelfPill } from '@/lib/dashboard/builder/ShelfPill';
import { FilterEditor } from '@/lib/dashboard/builder/FilterEditor';
import { VizGallery } from '@/lib/dashboard/builder/VizGallery';
import { FormatPanel } from '@/lib/dashboard/builder/FormatPanel';
import { DatasetPicker } from '@/lib/dashboard/builder/DatasetPicker';
import type { Widget } from '@/lib/dashboard/engine/doc';
import type { FieldDef, VizType } from '@/lib/dashboard/engine/types';

interface ConfigPanelProps {
  widget: Widget;
  onChange: (w: Widget) => void;
  onClose: () => void;
  onDelete: () => void;
}

export function ConfigPanel({ widget, onChange, onClose, onDelete }: ConfigPanelProps) {
  const { fields, rows, def } = useDatasetRows(widget.datasetId);
  const [tab, setTab] = useState<'data' | 'viz' | 'format'>('data');
  const [search, setSearch] = useState('');
  const [active, setActive] = useState<FieldDef | null>(null);

  const byKey = useMemo(() => Object.fromEntries(fields.map((f) => [f.key, f])), [fields]);
  const spec = widget.query;

  const distinctByField = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const f of fields) {
      if (f.role !== 'dimension') continue;
      const set = new Set<string>();
      for (const r of rows) {
        const v = dotGet(r, f.key);
        if (v != null && v !== '') set.add(String(v));
        if (set.size > 500) break;
      }
      out[f.key] = [...set].sort();
    }
    return out;
  }, [fields, rows]);

  const q = search.trim().toLowerCase();
  const match = (f: FieldDef) => !q || f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q);
  const dims = fields.filter((f) => f.role === 'dimension' && match(f));
  const meas = fields.filter((f) => f.role === 'measure' && match(f));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const setQuery = (q2: Widget['query']) => onChange({ ...widget, query: q2 });

  const dropField = (field: FieldDef, shelf: string) => {
    if (shelf === 'values' && field.role === 'measure') {
      setQuery(withMeasureAdded(spec, { field: field.key, agg: field.defaultAgg ?? 'sum', label: field.label, format: field.format }));
    } else if (shelf === 'category' && field.role === 'dimension') {
      setQuery(withCategory(spec, field.key));
    } else if (shelf === 'legend' && field.role === 'dimension') {
      setQuery(withSeries(spec, field.key));
    } else if (shelf === 'filters') {
      setQuery(withFilterAdded(spec, defaultFilter(field.key, field.role)));
    }
  };

  const quickAdd = (field: FieldDef) => {
    if (field.role === 'measure') return dropField(field, 'values');
    if (!spec.groupBy) return dropField(field, 'category');
    if (!spec.series) return dropField(field, 'legend');
    return dropField(field, 'filters');
  };

  const onDragStart = (e: DragStartEvent) => setActive((e.active.data.current as { field?: FieldDef })?.field ?? null);
  const onDragEnd = (e: DragEndEvent) => {
    setActive(null);
    const overId = e.over?.id?.toString();
    const field = (e.active.data.current as { field?: FieldDef })?.field;
    if (!overId || !field || !overId.startsWith('shelf:')) return;
    dropField(field, overId.slice('shelf:'.length));
  };

  const changeDataset = (id: string) => {
    const d = getDataset(id);
    onChange({
      ...widget,
      datasetId: id,
      query: { ...(d?.defaultSpec ?? { measures: [] }) },
      viz: d?.viz[0] ?? widget.viz,
    });
  };

  const measureLabels = (spec.measures ?? []).map(measureLabel);

  return (
    <div className="w-[340px] shrink-0 border-l border-default bg-brand-900 flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-default shrink-0">
        <h2 className="font-bold text-bright text-sm truncate">{widget.title || def?.label || 'Widget'}</h2>
        <button onClick={onClose} className="p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-bright">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex border-b border-default shrink-0 text-xs">
        {(['data', 'viz', 'format'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 font-medium capitalize transition-colors ${
              tab === t ? 'text-blue-400 border-b-2 border-blue-500 -mb-px' : 'text-muted-foreground hover:text-bright'
            }`}
          >
            {t === 'viz' ? 'Visual' : t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {tab === 'data' && (
          <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
            <DatasetPicker value={widget.datasetId} onChange={changeDataset} />

            <div>
              <div className="relative mb-1.5">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search fields…"
                  className="w-full pl-7 pr-2 py-1 text-xs bg-brand-800 border border-default rounded-md text-bright focus:outline-none"
                />
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                {dims.length > 0 && <p className="text-[9px] uppercase tracking-wide text-blue-400/80 font-bold">Dimensions</p>}
                {dims.map((f) => <FieldChip key={f.key} field={f} onQuickAdd={quickAdd} />)}
                {meas.length > 0 && <p className="text-[9px] uppercase tracking-wide text-emerald-400/80 font-bold mt-1.5">Measures</p>}
                {meas.map((f) => <FieldChip key={f.key} field={f} onQuickAdd={quickAdd} />)}
              </div>
            </div>

            <Shelf id="category" label="Category (X / group)" accepts={['dimension']} empty="Drag a dimension" hasItems={!!spec.groupBy}>
              {spec.groupBy && (
                <ShelfPill label={byKey[spec.groupBy]?.label ?? spec.groupBy} onRemove={() => setQuery(withCategory(spec, undefined))} />
              )}
            </Shelf>

            <Shelf id="values" label="Values (measures)" accepts={['measure']} empty="Drag a measure" hasItems={(spec.measures ?? []).length > 0}>
              {(spec.measures ?? []).map((m, i) => (
                <ShelfPill
                  key={`${m.field}-${i}`}
                  label={byKey[m.field]?.label ?? m.label ?? m.field}
                  agg={m.agg}
                  onAgg={(a) => setQuery(withMeasureAgg(spec, i, a))}
                  onRemove={() => setQuery(withMeasureRemoved(spec, i))}
                />
              ))}
            </Shelf>

            <Shelf id="legend" label="Legend / series (split)" accepts={['dimension']} empty="Optional dimension" hasItems={!!spec.series}>
              {spec.series && (
                <ShelfPill label={byKey[spec.series]?.label ?? spec.series} onRemove={() => setQuery(withSeries(spec, undefined))} />
              )}
            </Shelf>

            <Shelf id="filters" label="Filters" accepts={['dimension', 'measure']} empty="Drag any field" hasItems={(spec.filters ?? []).length > 0}>
              <div className="w-full space-y-1.5">
                {(spec.filters ?? []).map((f, i) => (
                  <FilterEditor
                    key={`${f.field}-${i}`}
                    filter={f}
                    field={byKey[f.field]}
                    options={distinctByField[f.field] ?? []}
                    onChange={(patch) => setQuery(withFilterUpdated(spec, i, patch))}
                    onRemove={() => setQuery(withFilterRemoved(spec, i))}
                  />
                ))}
              </div>
            </Shelf>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Sort by</label>
                <select
                  value={spec.sort?.by ?? ''}
                  onChange={(e) => (e.target.value ? setQuery(withSort(spec, e.target.value, spec.sort?.dir ?? 'desc')) : setQuery({ ...spec, sort: undefined }))}
                  className="w-full px-2 py-1.5 text-xs bg-brand-800 border border-default rounded-lg text-bright focus:outline-none"
                >
                  <option value="">Data order</option>
                  <option value="category">Category</option>
                  {measureLabels.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Direction</label>
                <select
                  value={spec.sort?.dir ?? 'desc'}
                  disabled={!spec.sort}
                  onChange={(e) => spec.sort && setQuery(withSort(spec, spec.sort.by, e.target.value as 'asc' | 'desc'))}
                  className="w-full px-2 py-1.5 text-xs bg-brand-800 border border-default rounded-lg text-bright focus:outline-none disabled:opacity-40"
                >
                  <option value="desc">Descending</option>
                  <option value="asc">Ascending</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Top N</label>
                <input
                  type="number"
                  min={0}
                  value={spec.topN?.n ?? ''}
                  placeholder="all"
                  onChange={(e) => setQuery(withTopN(spec, e.target.value ? Number(e.target.value) : undefined, spec.topN?.other ?? false))}
                  className="w-full px-2 py-1.5 text-xs bg-brand-800 border border-default rounded-lg text-bright focus:outline-none"
                />
              </div>
              <label className="flex items-center gap-1.5 text-xs text-foreground self-end pb-1.5">
                <input
                  type="checkbox"
                  checked={spec.topN?.other ?? false}
                  disabled={!spec.topN}
                  onChange={(e) => spec.topN && setQuery(withTopN(spec, spec.topN.n, e.target.checked))}
                />
                Group “Other”
              </label>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Drill-down path</label>
              <div className="flex flex-wrap gap-1">
                {fields.filter((f) => f.role === 'dimension').map((f) => {
                  const dd = widget.drillDimensions ?? [];
                  const idx = dd.indexOf(f.key);
                  const on = idx >= 0;
                  return (
                    <button
                      key={f.key}
                      onClick={() => {
                        const next = on ? dd.filter((k) => k !== f.key) : [...dd, f.key];
                        onChange({ ...widget, drillDimensions: next.length ? next : undefined });
                      }}
                      className={`px-1.5 py-0.5 rounded text-[11px] border transition-colors ${
                        on ? 'border-blue-500 bg-blue-500/10 text-blue-300' : 'border-default text-muted-foreground hover:text-bright'
                      }`}
                    >
                      {on ? `${idx + 1}. ${f.label}` : f.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Click dimensions in order — clicking a bar drills to the next level.</p>
            </div>

            <DragOverlay>{active && <FieldChip field={active} overlay />}</DragOverlay>
          </DndContext>
        )}

        {tab === 'viz' && (
          <VizGallery value={widget.viz} spec={spec} preferred={def?.viz} onChange={(v: VizType) => onChange({ ...widget, viz: v })} />
        )}

        {tab === 'format' && <FormatPanel widget={widget} onChange={onChange} />}
      </div>

      <div className="px-3 py-2.5 border-t border-default shrink-0">
        <button
          onClick={onDelete}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-red-500/30 hover:bg-red-500/10 text-red-400 text-xs font-medium transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete widget
        </button>
      </div>
    </div>
  );
}
