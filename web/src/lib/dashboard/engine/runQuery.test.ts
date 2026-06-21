import { describe, it, expect } from 'vitest';
import { runQuery } from '@/lib/dashboard/engine/runQuery';
import type { QuerySpec } from '@/lib/dashboard/engine/types';

describe('runQuery — ungrouped KPI', () => {
  it('aggregates a single measure over all rows', () => {
    const r = runQuery([{ x: 10 }, { x: 20 }, { x: 30 }], { measures: [{ field: 'x', agg: 'sum', label: 'X' }] });
    expect(r.categories).toEqual(['']);
    expect(r.series).toEqual([{ key: 'x', label: 'X', values: [60] }]);
    expect(r.scalar).toBe(60);
    expect(r.table).toEqual([{ X: 60 }]);
  });
  it('empty rows: avg → null scalar', () => {
    const r = runQuery([], { measures: [{ field: 'x', agg: 'avg', label: 'X' }] });
    expect(r.scalar).toBeNull();
  });
});

describe('runQuery — grouped', () => {
  it('counts rows per group (implicit count when no measures)', () => {
    const rows = [{ status: '200' }, { status: '200' }, { status: '404' }];
    const r = runQuery(rows, { groupBy: 'status' });
    expect(r.categories).toEqual(['200', '404']);
    expect(r.series[0].label).toBe('Count');
    expect(r.series[0].values).toEqual([2, 1]);
  });

  it('averages a measure per group', () => {
    const rows = [{ cat: 'a', v: 10 }, { cat: 'a', v: 20 }, { cat: 'b', v: 30 }];
    const r = runQuery(rows, { groupBy: 'cat', measures: [{ field: 'v', agg: 'avg', label: 'Avg' }] });
    expect(r.categories).toEqual(['a', 'b']);
    expect(r.series[0].values).toEqual([15, 30]);
  });

  it('series-split produces one series per series value, aligned + zero-filled', () => {
    const rows = [
      { cat: 'a', s: 'x', v: 1 },
      { cat: 'a', s: 'y', v: 2 },
      { cat: 'b', s: 'x', v: 3 },
    ];
    const spec: QuerySpec = { groupBy: 'cat', series: 's', measures: [{ field: 'v', agg: 'sum', label: 'V' }] };
    const r = runQuery(rows, spec);
    expect(r.categories).toEqual(['a', 'b']);
    expect(r.series).toEqual([
      { key: 'x', label: 'x', values: [1, 3] },
      { key: 'y', label: 'y', values: [2, 0] },
    ]);
    expect(r.table).toEqual([
      { cat: 'a', x: 1, y: 2 },
      { cat: 'b', x: 3, y: 0 },
    ]);
  });

  it('pre-aggregated data (one row per category) is identity under sum', () => {
    const rows = [{ label: '200', value: 10 }, { label: '404', value: 2 }];
    const r = runQuery(rows, { groupBy: 'label', measures: [{ field: 'value', agg: 'sum', label: 'Pages' }] });
    expect(r.categories).toEqual(['200', '404']);
    expect(r.series[0].values).toEqual([10, 2]);
  });
});

describe('runQuery — sort', () => {
  it('sorts categories numerically when all keys are numbers', () => {
    const rows = [{ d: '10', v: 1 }, { d: '2', v: 1 }, { d: '1', v: 1 }];
    const r = runQuery(rows, { groupBy: 'd', measures: [{ field: 'v', agg: 'sum', label: 'V' }], sort: { by: 'category', dir: 'asc' } });
    expect(r.categories).toEqual(['1', '2', '10']);
  });
  it('sorts ISO dates chronologically (lexical)', () => {
    const rows = [{ d: '2024-03-01', v: 1 }, { d: '2024-01-01', v: 1 }, { d: '2024-02-01', v: 1 }];
    const r = runQuery(rows, { groupBy: 'd', measures: [{ field: 'v', agg: 'sum', label: 'V' }], sort: { by: 'category', dir: 'asc' } });
    expect(r.categories).toEqual(['2024-01-01', '2024-02-01', '2024-03-01']);
  });
  it('sorts by a measure value (desc)', () => {
    const rows = [{ c: 'a', v: 3 }, { c: 'b', v: 9 }, { c: 'c', v: 5 }];
    const r = runQuery(rows, { groupBy: 'c', measures: [{ field: 'v', agg: 'sum', label: 'V' }], sort: { by: 'V', dir: 'desc' } });
    expect(r.categories).toEqual(['b', 'c', 'a']);
  });
});

describe('runQuery — topN + Other', () => {
  const rows = [
    { c: 'a', v: 10 }, { c: 'b', v: 8 }, { c: 'c', v: 5 }, { c: 'd', v: 2 },
  ];
  it('keeps top N and drops the rest by default', () => {
    const r = runQuery(rows, { groupBy: 'c', measures: [{ field: 'v', agg: 'sum', label: 'V' }], sort: { by: 'V', dir: 'desc' }, topN: { n: 2 } });
    expect(r.categories).toEqual(['a', 'b']);
  });
  it('buckets the remainder into Other (additive)', () => {
    const r = runQuery(rows, { groupBy: 'c', measures: [{ field: 'v', agg: 'sum', label: 'V' }], sort: { by: 'V', dir: 'desc' }, topN: { n: 2, other: true } });
    expect(r.categories).toEqual(['a', 'b', 'Other']);
    expect(r.series[0].values).toEqual([10, 8, 7]); // 5 + 2
  });
  it('Other computes a true mean for avg (merges accumulators)', () => {
    const avgRows = [
      { c: 'a', v: 10 }, { c: 'a', v: 10 },
      { c: 'b', v: 8 },
      { c: 'c', v: 4 }, { c: 'c', v: 4 }, { c: 'c', v: 4 }, { c: 'c', v: 4 },
      { c: 'd', v: 2 },
    ];
    const r = runQuery(avgRows, {
      groupBy: 'c',
      measures: [{ field: 'v', agg: 'avg', label: 'Avg' }],
      sort: { by: 'Avg', dir: 'desc' },
      topN: { n: 2, other: true },
    });
    expect(r.categories).toEqual(['a', 'b', 'Other']);
    // Other = c(4×4) + d(2) → (16+2)/5 = 3.6, NOT mean-of-means
    expect(r.series[0].values[2]).toBeCloseTo(3.6, 5);
  });
});

describe('runQuery — detail table mode', () => {
  it('returns projected raw rows when no groupBy and no measures', () => {
    const rows = [{ url: '/a', wc: 5, extra: 1 }, { url: '/b', wc: 9, extra: 2 }];
    const r = runQuery(rows, { measures: [], columns: ['url', 'wc'] });
    expect(r.categories).toEqual([]);
    expect(r.series).toEqual([]);
    expect(r.table).toEqual([{ url: '/a', wc: 5 }, { url: '/b', wc: 9 }]);
    expect(r.scalar).toBe(2);
  });
});

describe('runQuery — computed measure', () => {
  it('aggregates a per-row ratio', () => {
    const rows = [
      { c: 'a', miss: 1, total: 4 },
      { c: 'a', miss: 3, total: 6 },
    ];
    const r = runQuery(rows, {
      groupBy: 'c',
      measures: [{ field: 'altpct', agg: 'avg', label: 'Alt %', computed: { kind: 'ratio', numerator: 'miss', denominator: 'total', scale: 100 } }],
    });
    // row1 = 25, row2 = 50 → avg 37.5
    expect(r.series[0].values[0]).toBeCloseTo(37.5, 5);
  });
});
