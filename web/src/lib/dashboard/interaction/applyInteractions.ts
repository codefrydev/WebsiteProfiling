/**
 * Fold board-level interactions (slicers, cross-filter, drill) into a widget's
 * effective QuerySpec. Pure + testable. A slice/cross-filter only applies to a
 * widget whose dataset actually exposes the field (field-identity gate).
 */
import type { QuerySpec, Filter, FilterValue } from '@/lib/dashboard/engine/types';
import type { BoardSlicer, Widget } from '@/lib/dashboard/engine/doc';
import { getDataset } from '@/lib/dashboard/engine/datasets';

export interface CrossFilter {
  field: string;
  value: string;
  sourceWidgetId: string;
}

export interface DrillState {
  level: number;
  path: { field: string; value: string }[];
}

export interface InteractionState {
  slicerValues: Record<string, FilterValue>;
  crossFilter: CrossFilter | null;
  drill: Record<string, DrillState>;
}

/** Curated field keys for a dataset (the safe compatibility set). */
export function datasetFieldKeys(datasetId: string): Set<string> {
  const def = getDataset(datasetId);
  return new Set((def?.fields ?? []).map((f) => f.key));
}

export function slicerToFilter(slicer: BoardSlicer, value: FilterValue): Filter | null {
  switch (slicer.control) {
    case 'multiselect': {
      const arr = Array.isArray(value) ? value : value == null || value === '' ? [] : [value];
      if (!arr.length) return null;
      return { field: slicer.field, op: 'in', value: arr as FilterValue };
    }
    case 'search':
      return value ? { field: slicer.field, op: 'contains', value: String(value) } : null;
    case 'date-range':
      return Array.isArray(value) && value.length === 2
        ? { field: slicer.field, op: 'between', value: value as FilterValue, asDate: true }
        : null;
    case 'select':
    default:
      return value === '' || value == null ? null : { field: slicer.field, op: slicer.op, value };
  }
}

export function applyInteractions(
  widget: Widget,
  slicers: BoardSlicer[],
  state: InteractionState,
): QuerySpec {
  const keys = datasetFieldKeys(widget.datasetId);
  let spec: QuerySpec = widget.query;
  const injected: Filter[] = [];

  // Board slicers
  for (const s of slicers) {
    if (!keys.has(s.field)) continue;
    const f = slicerToFilter(s, state.slicerValues[s.id]);
    if (f) injected.push(f);
  }

  // Drill: path filters + groupBy override to the current level's dimension
  const drill = state.drill[widget.id];
  if (widget.drillDimensions?.length && drill) {
    for (const step of drill.path) {
      if (keys.has(step.field)) injected.push({ field: step.field, op: 'eq', value: step.value });
    }
    const gb = widget.drillDimensions[drill.level];
    if (gb) spec = { ...spec, groupBy: gb };
  }

  // Cross-filter from another widget
  const cf = state.crossFilter;
  if (cf && cf.sourceWidgetId !== widget.id && keys.has(cf.field)) {
    injected.push({ field: cf.field, op: 'eq', value: cf.value });
  }

  if (injected.length) spec = { ...spec, filters: [...(spec.filters ?? []), ...injected] };
  return spec;
}

/** Compute the next drill state when a category is clicked on a drillable widget. */
export function advanceDrill(widget: Widget, current: DrillState | undefined, clicked: string): DrillState | null {
  const dims = widget.drillDimensions ?? [];
  if (dims.length < 2) return null;
  const cur = current ?? { level: 0, path: [] };
  if (cur.level >= dims.length - 1) return null; // already at the deepest level
  return {
    level: cur.level + 1,
    path: [...cur.path, { field: dims[cur.level], value: clicked }],
  };
}
