import { describe, it, expect } from 'vitest';
import {
  applyInteractions,
  slicerToFilter,
  advanceDrill,
  datasetFieldKeys,
  type InteractionState,
} from '@/lib/dashboard/interaction/applyInteractions';
import type { Widget, BoardSlicer } from '@/lib/dashboard/engine/doc';

const linkWidget: Widget = {
  id: 'w1',
  title: '',
  datasetId: 'links',
  viz: 'bar',
  query: { groupBy: 'status', measures: [{ field: 'url', agg: 'count', label: 'Pages' }] },
  layout: { x: 0, y: 0, w: 6, h: 4 },
};

const emptyState: InteractionState = { slicerValues: {}, crossFilter: null, drill: {} };

describe('datasetFieldKeys', () => {
  it('returns curated keys for a known dataset', () => {
    const keys = datasetFieldKeys('links');
    expect(keys.has('status')).toBe(true);
    expect(keys.has('nonexistent')).toBe(false);
  });
});

describe('slicerToFilter', () => {
  const base: BoardSlicer = { id: 's', label: 'Status', field: 'status', datasetId: 'links', control: 'multiselect', op: 'in' };
  it('multiselect → in (or null when empty)', () => {
    expect(slicerToFilter(base, ['200', '404'])).toEqual({ field: 'status', op: 'in', value: ['200', '404'] });
    expect(slicerToFilter(base, [])).toBeNull();
  });
  it('search → contains; select → eq', () => {
    expect(slicerToFilter({ ...base, control: 'search' }, 'abc')).toMatchObject({ op: 'contains', value: 'abc' });
    expect(slicerToFilter({ ...base, control: 'select', op: 'eq' }, '200')).toMatchObject({ op: 'eq', value: '200' });
    expect(slicerToFilter({ ...base, control: 'select', op: 'eq' }, '')).toBeNull();
  });
});

describe('applyInteractions', () => {
  it('injects a compatible slicer filter', () => {
    const slicers: BoardSlicer[] = [{ id: 's1', label: 'Status', field: 'status', datasetId: 'links', control: 'multiselect', op: 'in' }];
    const state = { ...emptyState, slicerValues: { s1: ['200'] } };
    const spec = applyInteractions(linkWidget, slicers, state);
    expect(spec.filters).toContainEqual({ field: 'status', op: 'in', value: ['200'] });
  });

  it('skips slicers whose field is not in the dataset', () => {
    const slicers: BoardSlicer[] = [{ id: 's1', label: 'Q', field: 'query', datasetId: 'gsc_top_queries', control: 'multiselect', op: 'in' }];
    const spec = applyInteractions(linkWidget, slicers, { ...emptyState, slicerValues: { s1: ['x'] } });
    expect(spec.filters ?? []).toHaveLength(0); // 'query' not a links field
  });

  it('injects cross-filter but not into the source widget', () => {
    const cf = { field: 'status', value: '404', sourceWidgetId: 'other' };
    const spec = applyInteractions(linkWidget, [], { ...emptyState, crossFilter: cf });
    expect(spec.filters).toContainEqual({ field: 'status', op: 'eq', value: '404' });

    const selfSpec = applyInteractions(linkWidget, [], { ...emptyState, crossFilter: { ...cf, sourceWidgetId: 'w1' } });
    expect(selfSpec.filters ?? []).toHaveLength(0);
  });

  it('drill overrides groupBy and pushes path filters', () => {
    const w = { ...linkWidget, drillDimensions: ['host', 'path_segment', 'url'] };
    const state = { ...emptyState, drill: { w1: { level: 1, path: [{ field: 'host', value: 'x.com' }] } } };
    const spec = applyInteractions(w, [], state);
    expect(spec.groupBy).toBe('path_segment');
    expect(spec.filters).toContainEqual({ field: 'host', op: 'eq', value: 'x.com' });
  });

  it('does not mutate the original widget query', () => {
    applyInteractions(linkWidget, [], { ...emptyState, crossFilter: { field: 'status', value: '404', sourceWidgetId: 'other' } });
    expect(linkWidget.query.filters).toBeUndefined();
  });
});

describe('advanceDrill', () => {
  const w = { ...linkWidget, drillDimensions: ['host', 'path_segment', 'url'] };
  it('advances level and appends to path', () => {
    expect(advanceDrill(w, undefined, 'x.com')).toEqual({ level: 1, path: [{ field: 'host', value: 'x.com' }] });
  });
  it('returns null at the deepest level or when fewer than 2 dims', () => {
    expect(advanceDrill(w, { level: 2, path: [] }, 'z')).toBeNull();
    expect(advanceDrill(linkWidget, undefined, 'z')).toBeNull();
  });
});
