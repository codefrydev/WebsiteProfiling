import { describe, it, expect } from 'vitest';
import { applyFilters, hasFilterValue } from '@/lib/dashboard/engine/filter';

const rows = [
  { url: '/a', status: '200', depth: 0, when: '2024-01-01' },
  { url: '/b', status: 404, depth: 2, when: '2024-02-01' },
  { url: '/c', status: '301', depth: 3, when: '2024-03-01' },
];

describe('applyFilters', () => {
  it('no filters returns input unchanged', () => {
    expect(applyFilters(rows)).toBe(rows);
    expect(applyFilters(rows, [])).toBe(rows);
  });

  it('eq is type-loose (string "404" matches number 404)', () => {
    expect(applyFilters(rows, [{ field: 'status', op: 'eq', value: 404 }])).toHaveLength(1);
    expect(applyFilters(rows, [{ field: 'status', op: 'eq', value: '404' }])).toHaveLength(1);
  });

  it('in / nin', () => {
    expect(applyFilters(rows, [{ field: 'status', op: 'in', value: ['200', '301'] }])).toHaveLength(2);
    expect(applyFilters(rows, [{ field: 'status', op: 'nin', value: ['200'] }])).toHaveLength(2);
  });

  it('contains is case-insensitive substring', () => {
    expect(applyFilters(rows, [{ field: 'url', op: 'contains', value: 'B' }])).toHaveLength(1);
  });

  it('numeric gt/gte/lt/between', () => {
    expect(applyFilters(rows, [{ field: 'depth', op: 'gt', value: 0 }])).toHaveLength(2);
    expect(applyFilters(rows, [{ field: 'depth', op: 'gte', value: 2 }])).toHaveLength(2);
    expect(applyFilters(rows, [{ field: 'depth', op: 'between', value: [1, 2] }])).toHaveLength(1);
  });

  it('date comparison via asDate', () => {
    const r = applyFilters(rows, [
      { field: 'when', op: 'between', value: ['2024-01-15', '2024-02-15'], asDate: true },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].url).toBe('/b');
  });

  it('empty filter values are no-ops', () => {
    expect(applyFilters(rows, [{ field: 'status', op: 'in', value: [] }])).toHaveLength(3);
    expect(applyFilters(rows, [{ field: 'url', op: 'contains', value: '' }])).toHaveLength(3);
  });

  it('multiple filters AND together', () => {
    const r = applyFilters(rows, [
      { field: 'depth', op: 'gte', value: 1 },
      { field: 'status', op: 'eq', value: '301' },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].url).toBe('/c');
  });
});

describe('hasFilterValue', () => {
  it('detects empty vs constraining', () => {
    expect(hasFilterValue({ field: 'x', op: 'in', value: [] })).toBe(false);
    expect(hasFilterValue({ field: 'x', op: 'contains', value: '' })).toBe(false);
    expect(hasFilterValue({ field: 'x', op: 'eq', value: 0 })).toBe(true);
    expect(hasFilterValue({ field: 'x', op: 'eq', value: 'a' })).toBe(true);
  });
});
