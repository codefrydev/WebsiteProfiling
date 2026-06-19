import { describe, expect, it } from 'vitest';
import {
  DASHBOARD_CATALOG,
  catalogEntry,
  catalogBySection,
  catalogBySectionSections,
  dimensions,
  measures,
  fieldKeys,
  defaultDimension,
  defaultMeasure,
} from '@/lib/dashboardCatalog';

describe('DASHBOARD_CATALOG integrity', () => {
  it('has at least one entry', () => {
    expect(DASHBOARD_CATALOG.length).toBeGreaterThan(0);
  });

  it('every entry has a non-empty toolName, label, section, description, and compatibleViz', () => {
    for (const e of DASHBOARD_CATALOG) {
      expect(e.toolName.length, `toolName empty for ${e.label}`).toBeGreaterThan(0);
      expect(e.label.length, `label empty for ${e.toolName}`).toBeGreaterThan(0);
      expect(e.section.length, `section empty for ${e.toolName}`).toBeGreaterThan(0);
      expect(e.description.length, `description empty for ${e.toolName}`).toBeGreaterThan(0);
      expect(e.compatibleViz.length, `compatibleViz empty for ${e.toolName}`).toBeGreaterThan(0);
    }
  });

  it('toolNames are unique', () => {
    const names = DASHBOARD_CATALOG.map((e) => e.toolName);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('catalogEntry', () => {
  it('returns the matching entry by toolName', () => {
    const entry = catalogEntry('get_report_summary');
    expect(entry).toBeDefined();
    expect(entry?.label).toBe('Audit summary');
    expect(entry?.section).toBe('Overview');
  });

  it('returns undefined for an unknown tool', () => {
    expect(catalogEntry('nonexistent_tool_xyz')).toBeUndefined();
  });

  it('returns the entry with expected compatibleViz', () => {
    const entry = catalogEntry('get_category_scores');
    expect(entry?.compatibleViz).toContain('bar');
    expect(entry?.compatibleViz).toContain('table');
  });
});

describe('catalogBySectionSections', () => {
  it('returns a non-empty array of section strings', () => {
    const sections = catalogBySectionSections();
    expect(sections.length).toBeGreaterThan(0);
    for (const s of sections) {
      expect(typeof s).toBe('string');
      expect(s.length).toBeGreaterThan(0);
    }
  });

  it('contains no duplicate sections', () => {
    const sections = catalogBySectionSections();
    expect(new Set(sections).size).toBe(sections.length);
  });

  it('includes "Overview" and "Performance"', () => {
    const sections = catalogBySectionSections();
    expect(sections).toContain('Overview');
    expect(sections).toContain('Performance');
  });
});

describe('catalog field helpers', () => {
  it('dimensions() returns only dimension-role fields', () => {
    const entry = catalogEntry('get_category_scores')!;
    const dims = dimensions(entry);
    expect(dims.length).toBeGreaterThan(0);
    for (const f of dims) expect(f.role).toBe('dimension');
  });

  it('measures() returns only measure-role fields', () => {
    const entry = catalogEntry('get_category_scores')!;
    const ms = measures(entry);
    expect(ms.length).toBeGreaterThan(0);
    for (const f of ms) expect(f.role).toBe('measure');
  });

  it('dimensions + measures cover all fieldKeys', () => {
    const entry = catalogEntry('get_category_scores')!;
    const all = fieldKeys(entry).sort();
    const split = [...dimensions(entry), ...measures(entry)].map((f) => f.key).sort();
    expect(split).toEqual(all);
  });

  it('defaultDimension returns first dimension key', () => {
    const entry = catalogEntry('get_category_scores')!;
    expect(defaultDimension(entry)).toBe(dimensions(entry)[0]?.key);
  });

  it('defaultMeasure returns first measure key', () => {
    const entry = catalogEntry('get_category_scores')!;
    expect(defaultMeasure(entry)).toBe(measures(entry)[0]?.key);
  });

  it('every DASHBOARD_CATALOG entry has at least one field', () => {
    for (const e of DASHBOARD_CATALOG) {
      expect(e.fields.length, `${e.toolName} must have at least one field`).toBeGreaterThan(0);
    }
  });

  it('catalog entries supporting charts have at least one measure', () => {
    const chartViz = ['bar', 'horizontal-bar', 'ranked-bar', 'line', 'area', 'pie', 'doughnut', 'stacked-bar'];
    for (const e of DASHBOARD_CATALOG) {
      if (e.compatibleViz.some((v) => chartViz.includes(v))) {
        expect(measures(e).length, `${e.toolName} has chart viz but no measures`).toBeGreaterThan(0);
      }
    }
  });
});

describe('catalogBySection', () => {
  it('groups entries under their section', () => {
    const bySection = catalogBySection();
    expect(bySection['Overview']).toBeDefined();
    expect(bySection['Overview'].length).toBeGreaterThan(0);
    for (const entry of bySection['Overview']) {
      expect(entry.section).toBe('Overview');
    }
  });

  it('sections in the map match catalogBySectionSections()', () => {
    const sections = catalogBySectionSections();
    const bySection = catalogBySection();
    expect(Object.keys(bySection).sort()).toEqual([...sections].sort());
  });

  it('total entries across all sections equals DASHBOARD_CATALOG length', () => {
    const bySection = catalogBySection();
    const total = Object.values(bySection).reduce((sum, arr) => sum + arr.length, 0);
    expect(total).toBe(DASHBOARD_CATALOG.length);
  });
});
