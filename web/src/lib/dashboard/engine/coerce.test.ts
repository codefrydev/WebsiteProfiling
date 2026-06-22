import { describe, it, expect } from 'vitest';
import { toNumber, dotGet, humanize, percentile } from '@/lib/dashboard/engine/coerce';

describe('toNumber', () => {
  it('passes finite numbers', () => {
    expect(toNumber(3)).toBe(3);
    expect(toNumber(0)).toBe(0);
    expect(toNumber(-2.5)).toBe(-2.5);
  });
  it('rejects non-finite numbers', () => {
    expect(toNumber(Infinity)).toBeNull();
    expect(toNumber(NaN)).toBeNull();
  });
  it('parses numeric strings, rejects junk', () => {
    expect(toNumber('42')).toBe(42);
    expect(toNumber(' 3.5 ')).toBe(3.5);
    expect(toNumber('')).toBeNull();
    expect(toNumber('abc')).toBeNull();
  });
  it('coerces booleans, rejects null/objects', () => {
    expect(toNumber(true)).toBe(1);
    expect(toNumber(false)).toBe(0);
    expect(toNumber(null)).toBeNull();
    expect(toNumber(undefined)).toBeNull();
    expect(toNumber({})).toBeNull();
  });
});

describe('dotGet', () => {
  const obj = { a: { b: { c: 5 } }, x: 1 };
  it('reads shallow and nested paths', () => {
    expect(dotGet(obj, 'x')).toBe(1);
    expect(dotGet(obj, 'a.b.c')).toBe(5);
  });
  it('returns undefined for missing paths without throwing', () => {
    expect(dotGet(obj, 'a.z.c')).toBeUndefined();
    expect(dotGet(null, 'a')).toBeUndefined();
    expect(dotGet(obj, 'a.b.c.d')).toBeUndefined();
  });
  it('returns the object itself for empty path', () => {
    expect(dotGet(obj, '')).toBe(obj);
  });
});

describe('humanize', () => {
  it('uses last segment, replaces underscores, capitalizes', () => {
    expect(humanize('crawl_summary.count_4xx')).toBe('Count 4xx');
    expect(humanize('word_count')).toBe('Word count');
    expect(humanize('url')).toBe('Url');
  });
});

describe('percentile', () => {
  it('computes median with interpolation', () => {
    expect(percentile([1, 2, 3], 0.5)).toBe(2);
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
  });
  it('handles single and empty', () => {
    expect(percentile([7], 0.5)).toBe(7);
    expect(percentile([], 0.5)).toBeNull();
  });
  it('ignores non-finite and does not mutate input', () => {
    const input = [3, 1, 2];
    expect(percentile([1, 2, NaN, 3], 0.5)).toBe(2);
    percentile(input, 0.5);
    expect(input).toEqual([3, 1, 2]);
  });
});
