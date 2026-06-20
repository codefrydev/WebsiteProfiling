import { describe, expect, it } from 'vitest';
import {
  DASHBOARD_CATALOG,
  catalogEntry,
  dimensions,
  measures,
  fieldKeys,
  defaultDimension,
  defaultMeasure,
} from '@/lib/dashboard/catalog/catalog';

describe('CatalogField helpers', () => {
  const entry = catalogEntry('get_category_scores')!;

  it('dimensions() returns only dimension fields', () => {
    const dims = dimensions(entry);
    expect(dims.length).toBeGreaterThan(0);
    for (const f of dims) {
      expect(f.role).toBe('dimension');
    }
  });

  it('measures() returns only measure fields', () => {
    const ms = measures(entry);
    expect(ms.length).toBeGreaterThan(0);
    for (const f of ms) {
      expect(f.role).toBe('measure');
    }
  });

  it('dimensions() + measures() together cover all fields', () => {
    const all = fieldKeys(entry);
    const split = [...dimensions(entry), ...measures(entry)].map((f) => f.key);
    expect(split.sort()).toEqual(all.sort());
  });

  it('defaultDimension() returns first dimension key', () => {
    const d = defaultDimension(entry);
    expect(d).toBe(dimensions(entry)[0]?.key);
  });

  it('defaultMeasure() returns first measure key', () => {
    const m = defaultMeasure(entry);
    expect(m).toBe(measures(entry)[0]?.key);
  });
});

describe('DASHBOARD_CATALOG integrity', () => {
  it('every entry has fields and at least one field with a role', () => {
    for (const e of DASHBOARD_CATALOG) {
      expect(e.fields.length, `${e.toolName} has no fields`).toBeGreaterThan(0);
    }
  });

  it('chart-only entries have at least one measure', () => {
    const chartViz = ['bar', 'horizontal-bar', 'ranked-bar', 'line', 'area', 'pie', 'doughnut', 'stacked-bar'];
    for (const e of DASHBOARD_CATALOG) {
      const hasChartViz = e.compatibleViz.some((v) => chartViz.includes(v));
      if (hasChartViz) {
        const ms = measures(e);
        expect(ms.length, `${e.toolName} supports chart viz but has no measure fields`).toBeGreaterThan(0);
      }
    }
  });

  it('all field roles are valid', () => {
    for (const e of DASHBOARD_CATALOG) {
      for (const f of e.fields) {
        expect(['dimension', 'measure']).toContain(f.role);
      }
    }
  });

  it('all field keys are non-empty strings', () => {
    for (const e of DASHBOARD_CATALOG) {
      for (const f of e.fields) {
        expect(typeof f.key).toBe('string');
        expect(f.key.length).toBeGreaterThan(0);
        expect(typeof f.label).toBe('string');
        expect(f.label.length).toBeGreaterThan(0);
      }
    }
  });
});
