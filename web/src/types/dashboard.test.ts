import { describe, expect, it } from 'vitest';
import { emptyDashboard, newWidgetId } from '@/types/dashboard';

describe('emptyDashboard', () => {
  it('returns version 1 with an empty widget array', () => {
    const d = emptyDashboard();
    expect(d.version).toBe(1);
    expect(d.widgets).toEqual([]);
  });

  it('returns a fresh object on each call (no shared reference)', () => {
    const a = emptyDashboard();
    const b = emptyDashboard();
    a.widgets.push({
      id: 'w-1', title: 'test', viz: 'kpi', layout: { x: 0, y: 0, w: 4, h: 2 },
      binding: { source: 'audit-tool', toolName: 'get_report_summary' },
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
    const id = newWidgetId();
    expect(id).toMatch(/^[a-z0-9-]+$/);
  });
});
