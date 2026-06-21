import { describe, it, expect } from 'vitest';
import {
  emptyDashboard,
  migrateDocToV2,
  defaultWidgetLayout,
  newWidgetId,
  type DashboardDoc,
} from '@/lib/dashboard/engine/doc';

describe('emptyDashboard', () => {
  it('is a valid empty v2 doc', () => {
    expect(emptyDashboard()).toEqual({ version: 2, widgets: [], slicers: [] });
  });
});

describe('migrateDocToV2', () => {
  it('normalizes a valid v2 doc and drops malformed widgets', () => {
    const doc: DashboardDoc = {
      version: 2,
      widgets: [
        { id: 'w1', title: 'A', datasetId: 'links', viz: 'bar', query: { measures: [] }, layout: { x: 0, y: 0, w: 6, h: 4 } },
      ],
      slicers: [],
    };
    const withJunk = { ...doc, widgets: [...doc.widgets, { id: 'bad' }] };
    const out = migrateDocToV2(withJunk);
    expect(out.widgets).toHaveLength(1);
    expect(out.widgets[0].id).toBe('w1');
  });

  it('resets pre-v2 / garbage docs to an empty board (no crash)', () => {
    expect(migrateDocToV2({ version: 1, widgets: [{ binding: { toolName: 'x' } }] })).toEqual(emptyDashboard());
    expect(migrateDocToV2(null)).toEqual(emptyDashboard());
    expect(migrateDocToV2('nonsense')).toEqual(emptyDashboard());
    expect(migrateDocToV2({})).toEqual(emptyDashboard());
  });

  it('round-trips through JSON with no Infinity/NaN/functions', () => {
    const doc = migrateDocToV2({
      version: 2,
      widgets: [{ id: 'w', title: 'T', datasetId: 'd', viz: 'kpi', query: { measures: [{ field: 'x', agg: 'sum' }] }, layout: { x: 0, y: 0, w: 3, h: 2 } }],
      slicers: [],
    });
    const json = JSON.stringify(doc);
    expect(json).not.toContain('null,null'); // sanity
    expect(JSON.parse(json)).toEqual(doc);
  });
});

describe('defaultWidgetLayout', () => {
  it('returns finite sizes per viz', () => {
    for (const v of ['kpi', 'gauge', 'table', 'text', 'bar'] as const) {
      const l = defaultWidgetLayout(v);
      expect(Number.isFinite(l.w) && Number.isFinite(l.h)).toBe(true);
    }
    expect(defaultWidgetLayout('table').w).toBe(8);
  });
});

describe('newWidgetId', () => {
  it('produces distinct ids', () => {
    const a = newWidgetId();
    const b = newWidgetId();
    expect(a).not.toBe(b);
    expect(a.startsWith('w-')).toBe(true);
  });
});
