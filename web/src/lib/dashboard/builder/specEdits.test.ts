import { describe, it, expect } from 'vitest';
import {
  withCategory,
  withSeries,
  withMeasureAdded,
  withMeasureRemoved,
  withMeasureAgg,
  withFilterAdded,
  withFilterUpdated,
  withTopN,
  defaultFilter,
  opsForRole,
} from '@/lib/dashboard/builder/specEdits';
import type { QuerySpec } from '@/lib/dashboard/engine/types';

const base: QuerySpec = { measures: [] };

describe('specEdits', () => {
  it('sets/clears category and series immutably', () => {
    const a = withCategory(base, 'status');
    expect(a.groupBy).toBe('status');
    expect(base.groupBy).toBeUndefined(); // immutable
    expect(withCategory(a, '').groupBy).toBeUndefined();
    expect(withSeries(a, 'depth').series).toBe('depth');
  });

  it('adds, retags, and removes measures', () => {
    let s = withMeasureAdded(base, { field: 'clicks', agg: 'sum', label: 'Clicks' });
    s = withMeasureAdded(s, { field: 'impressions', agg: 'sum', label: 'Impr' });
    expect(s.measures).toHaveLength(2);
    s = withMeasureAgg(s, 0, 'avg');
    expect(s.measures![0].agg).toBe('avg');
    s = withMeasureRemoved(s, 0);
    expect(s.measures).toHaveLength(1);
    expect(s.measures![0].field).toBe('impressions');
  });

  it('adds and updates filters', () => {
    let s = withFilterAdded(base, { field: 'status', op: 'in', value: ['200'] });
    s = withFilterUpdated(s, 0, { value: ['200', '404'] });
    expect(s.filters![0].value).toEqual(['200', '404']);
  });

  it('topN: sets and clears', () => {
    expect(withTopN(base, 10, true).topN).toEqual({ n: 10, other: true });
    expect(withTopN(withTopN(base, 10, true), 0, false).topN).toBeUndefined();
  });

  it('defaultFilter + opsForRole by role', () => {
    expect(defaultFilter('x', 'measure')).toEqual({ field: 'x', op: 'gte', value: 0 });
    expect(defaultFilter('x', 'dimension').op).toBe('in');
    expect(opsForRole('measure')).toContain('between');
    expect(opsForRole('dimension')).toContain('contains');
  });
});
