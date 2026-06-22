import { describe, expect, it } from 'vitest';
import { emptyDashboard, newWidgetId } from '@/types/dashboard';

describe('emptyDashboard', () => {
  it('returns a v2 doc with empty widgets + slicers', () => {
    const d = emptyDashboard();
    expect(d.version).toBe(2);
    expect(d.widgets).toEqual([]);
    expect(d.slicers).toEqual([]);
  });

  it('returns a fresh object on each call (no shared reference)', () => {
    const a = emptyDashboard();
    const b = emptyDashboard();
    a.widgets.push({
      id: 'w-1',
      title: 'test',
      datasetId: 'summary',
      viz: 'kpi',
      query: { measures: [{ field: 'health_score', agg: 'max' }] },
      layout: { x: 0, y: 0, w: 3, h: 2 },
    });
    expect(b.widgets).toHaveLength(0);
  });
});

describe('newWidgetId', () => {
  it('starts with "w-"', () => {
    expect(newWidgetId()).toMatch(/^w-/);
  });

  it('generates unique ids across multiple calls', () => {
    const ids = Array.from({ length: 50 }, () => newWidgetId());
    expect(new Set(ids).size).toBe(50);
  });

  it('only contains alphanumeric and hyphen characters', () => {
    expect(newWidgetId()).toMatch(/^[a-z0-9-]+$/);
  });
});
