import { describe, expect, it } from 'vitest';
import {
  dominantBucketLabel,
  thinWordCountPages,
  titleMetaProblemPages,
  wordCountBucketColors,
  responseTimeBucketColors,
  statusDistributionTakeaway,
} from './overviewChartInsights';
import { SEMANTIC } from '@/utils/chartPalette';

describe('overviewChartInsights', () => {
  it('colors thin word-count buckets as poor', () => {
    const colors = wordCountBucketColors(['0-100', '101-300', '601-1000']);
    expect(colors[0]).toBe(SEMANTIC.poor);
    expect(colors[1]).toBe(SEMANTIC.poor);
    expect(colors[2]).toBe(SEMANTIC.good);
  });

  it('colors slow response buckets as poor', () => {
    const colors = responseTimeBucketColors(['<200ms', '1-2s', '>2s']);
    expect(colors[0]).toBe(SEMANTIC.good);
    expect(colors[1]).toBe(SEMANTIC.poor);
    expect(colors[2]).toBe(SEMANTIC.poor);
  });

  it('finds dominant bucket', () => {
    const dominant = dominantBucketLabel(['a', 'b', 'c'], [10, 50, 5]);
    expect(dominant?.label).toBe('b');
    expect(dominant?.count).toBe(50);
    expect(dominant?.pct).toBeGreaterThan(75);
  });

  it('sums thin word count pages', () => {
    expect(thinWordCountPages({ '0-100': 5, '101-300': 3, '601-1000': 2 })).toBe(8);
  });

  it('sums title meta problems', () => {
    expect(
      titleMetaProblemPages({
        missing_title: 2,
        title_ok: 10,
        missing_meta_desc: 3,
        meta_desc_ok: 8,
      }),
    ).toBe(5);
  });

  it('builds status takeaway for errors', () => {
    const takeaway = statusDistributionTakeaway({ '404': 10, '500': 2 }, 100);
    expect(takeaway).toContain('12');
  });
});
