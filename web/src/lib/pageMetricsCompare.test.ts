import { describe, expect, it } from 'vitest';
import { buildPageMetricsCompare } from './pageMetricsCompare';

const labels = {
  gscClicks: 'Clicks',
  gscImpressions: 'Impressions',
  gscCtr: 'CTR %',
  gscPosition: 'Avg position',
  ga4Sessions: 'Sessions',
  ga4Users: 'Users',
  ga4Views: 'Page views',
  ga4Engagement: 'Engagement rate',
  ga4Duration: 'Avg session (s)',
};

describe('buildPageMetricsCompare', () => {
  it('computes deltas and deltaPct for GSC metrics', () => {
    const rows = buildPageMetricsCompare(
      { gsc: { clicks: 120, impressions: 1000, ctr: 5, position: 8.2 } },
      { gsc: { clicks: 100, impressions: 800, ctr: 4, position: 9.5 } },
      labels,
    );
    const clicks = rows.find((r) => r.id === 'gsc_clicks');
    expect(clicks?.delta).toBe(20);
    expect(clicks?.deltaPct).toBe(20);
    const pos = rows.find((r) => r.id === 'gsc_pos');
    expect(pos?.higherIsBetter).toBe(false);
    expect(pos?.delta).toBeCloseTo(-1.3, 1);
  });

  it('omits rows when both sides are empty', () => {
    const rows = buildPageMetricsCompare({ gsc: null, ga4: null }, { gsc: null, ga4: null }, labels);
    expect(rows).toHaveLength(0);
  });
});
