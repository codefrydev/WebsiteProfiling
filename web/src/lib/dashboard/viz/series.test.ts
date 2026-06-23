import { describe, expect, it } from 'vitest';
import { extractMultiSeries } from '@/lib/dashboard/viz/series';
import type { Widget } from '@/lib/dashboard/types';
import type { CatalogEntry } from '@/lib/dashboard/catalog/catalog';
import type { WidgetData } from '@/lib/dashboard/data/fetchWidgetData';

function makeWidget(overrides: Partial<Widget['binding']> = {}): Widget {
  return {
    id: 'w-test',
    title: 'Test',
    viz: 'bar',
    layout: { x: 0, y: 0, w: 6, h: 4 },
    binding: {
      source: 'audit-tool',
      toolName: 'get_category_scores',
      select: 'categories',
      xField: 'name',
      yField: 'score',
      ...overrides,
    },
  };
}

const CATALOG: CatalogEntry = {
  toolName: 'get_category_scores',
  label: 'Category scores',
  section: 'Overview',
  description: '',
  rowsPath: 'categories',
  fields: [
    { key: 'name', label: 'Category', role: 'dimension' },
    { key: 'score', label: 'Score', role: 'measure' },
  ],
  compatibleViz: ['bar'],
};

const DATA: WidgetData = {
  raw: {},
  rows: [
    { name: 'SEO', score: 80 },
    { name: 'Performance', score: 65 },
    { name: 'Security', score: 90 },
  ],
  kpiValue: null,
};

describe('extractMultiSeries (single-series)', () => {
  it('returns single dataset when no seriesField', () => {
    const ss = extractMultiSeries(makeWidget(), DATA, CATALOG, {});
    expect(ss).not.toBeNull();
    expect(ss!.series.length).toBe(1);
    expect(ss!.labels).toEqual(['SEO', 'Performance', 'Security']);
    expect(ss!.series[0]!.values).toEqual([80, 65, 90]);
  });

  it('respects chartSort desc', () => {
    const ss = extractMultiSeries(makeWidget(), DATA, CATALOG, { chartSort: 'desc' });
    expect(ss!.labels[0]).toBe('Security');
    expect(ss!.labels[2]).toBe('Performance');
  });

  it('respects chartMaxItems', () => {
    const ss = extractMultiSeries(makeWidget(), DATA, CATALOG, { chartMaxItems: 2 });
    expect(ss!.labels.length).toBe(2);
  });

  it('returns null when no rows and no scalar data', () => {
    const emptyData: WidgetData = { raw: {}, rows: [], kpiValue: null };
    const ss = extractMultiSeries(makeWidget(), emptyData, CATALOG, {});
    expect(ss).toBeNull();
  });
});

describe('extractMultiSeries (multi-series pivot)', () => {
  const MULTI_DATA: WidgetData = {
    raw: {},
    rows: [
      { category: 'SEO', month: 'Jan', score: 80 },
      { category: 'SEO', month: 'Feb', score: 85 },
      { category: 'Perf', month: 'Jan', score: 60 },
      { category: 'Perf', month: 'Feb', score: 70 },
    ],
    kpiValue: null,
  };

  it('pivots rows into multiple series by seriesField', () => {
    const widget = makeWidget({ xField: 'month', yField: 'score', seriesField: 'category' });
    const ss = extractMultiSeries(widget, MULTI_DATA, CATALOG, {});
    expect(ss).not.toBeNull();
    expect(ss!.labels).toEqual(['Jan', 'Feb']);
    expect(ss!.series.length).toBe(2);
    const seoSeries = ss!.series.find((s) => s.key === 'SEO');
    expect(seoSeries).toBeDefined();
    expect(seoSeries!.values).toEqual([80, 85]);
    const perfSeries = ss!.series.find((s) => s.key === 'Perf');
    expect(perfSeries!.values).toEqual([60, 70]);
  });

  it('fills missing pivot cells with 0', () => {
    const sparseData: WidgetData = {
      raw: {},
      rows: [
        { category: 'SEO', month: 'Jan', score: 80 },
        { category: 'Perf', month: 'Feb', score: 70 },
      ],
      kpiValue: null,
    };
    const widget = makeWidget({ xField: 'month', yField: 'score', seriesField: 'category' });
    const ss = extractMultiSeries(widget, sparseData, CATALOG, {});
    const seoSeries = ss!.series.find((s) => s.key === 'SEO')!;
    const perfSeries = ss!.series.find((s) => s.key === 'Perf')!;
    // SEO has no Feb => 0
    expect(seoSeries.values[1]).toBe(0);
    // Perf has no Jan => 0
    expect(perfSeries.values[0]).toBe(0);
  });
});
