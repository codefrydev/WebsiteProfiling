import { describe, it, expect } from 'vitest';
import {
  fromParallel,
  fromMap,
  flattenCategoryIssues,
  flattenLighthouseByUrl,
  flatPrefix,
} from '@/lib/dashboard/engine/accessors';

describe('fromParallel', () => {
  it('zips labels and values', () => {
    expect(fromParallel(['a', 'b'], [1, 2])).toEqual([
      { label: 'a', value: 1 },
      { label: 'b', value: 2 },
    ]);
  });
  it('defaults missing values to 0 and tolerates absent arrays', () => {
    expect(fromParallel(['a', 'b'], [5])).toEqual([
      { label: 'a', value: 5 },
      { label: 'b', value: 0 },
    ]);
    expect(fromParallel(undefined, [1])).toEqual([]);
  });
});

describe('fromMap', () => {
  it('turns a record into label/value rows', () => {
    expect(fromMap({ '200': 10, '404': 2 })).toEqual([
      { label: '200', value: 10 },
      { label: '404', value: 2 },
    ]);
  });
  it('handles null/undefined', () => {
    expect(fromMap(null)).toEqual([]);
    expect(fromMap(undefined)).toEqual([]);
  });
});

describe('flattenCategoryIssues', () => {
  it('flattens issues and attaches category context', () => {
    const rows = flattenCategoryIssues([
      { name: 'SEO', score: 80, issues: [{ message: 'm1', priority: 'High' }] },
      { name: 'Perf', score: 50, issues: [{ message: 'm2' }, { message: 'm3' }] },
    ]);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ message: 'm1', priority: 'High', category: 'SEO', category_score: 80 });
    expect(rows[2]).toMatchObject({ message: 'm3', category: 'Perf', category_score: 50 });
  });
  it('handles missing issues / input', () => {
    expect(flattenCategoryIssues([{ name: 'X' }])).toEqual([]);
    expect(flattenCategoryIssues(undefined)).toEqual([]);
  });
});

describe('flattenLighthouseByUrl', () => {
  it('produces one row per url with coerced scores', () => {
    const rows = flattenLighthouseByUrl({
      'https://a/': { category_scores: { performance: 0.9, seo: 1 }, median_metrics: { lcp_ms: 1200 } },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ url: 'https://a/', performance_score: 0.9, seo_score: 1, lcp_ms: 1200 });
  });
  it('handles empty input', () => {
    expect(flattenLighthouseByUrl(undefined)).toEqual([]);
  });
});

describe('flatPrefix', () => {
  it('prefixes keys', () => {
    expect(flatPrefix('gsc', { clicks: 1, ctr: 0.1 })).toEqual({ 'gsc.clicks': 1, 'gsc.ctr': 0.1 });
  });
  it('handles nullish', () => {
    expect(flatPrefix('x', null)).toEqual({});
  });
});
