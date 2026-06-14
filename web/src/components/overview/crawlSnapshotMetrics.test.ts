import { describe, expect, it } from 'vitest';
import {
  buildViewHref,
  medianWordsBand,
  pctOfCrawl,
  responseTimeBand,
  selectCrawlConcerns,
  successRateBand,
} from './crawlSnapshotMetrics';

describe('crawlSnapshotMetrics', () => {
  it('computes crawl percentage', () => {
    expect(pctOfCrawl(255, 1500)).toBe(17);
    expect(pctOfCrawl(0, 1500)).toBeNull();
  });

  it('bands success rate', () => {
    expect(successRateBand(95)).toBe('good');
    expect(successRateBand(85)).toBe('fair');
    expect(successRateBand(79)).toBe('critical');
  });

  it('bands median words and response time', () => {
    expect(medianWordsBand(64)).toBe('critical');
    expect(medianWordsBand(200)).toBe('fair');
    expect(responseTimeBand(2235)).toBe('critical');
  });

  it('builds view href with tab param', () => {
    expect(buildViewHref('overview', '?domain=example.com', { tab: 'charts' })).toBe(
      '/dashboard?domain=example.com&tab=charts',
    );
  });

  it('selects top crawl concerns by severity', () => {
    const concerns = selectCrawlConcerns({
      brokenCount: 255,
      h1Zero: 405,
      crawledCount: 1500,
      successRate: 79,
      medianWords: 64,
      responseP50: 2235,
      linksHref: '/links',
      contentHref: '/content',
      contentAnalyticsHref: '/content-analytics',
      chartsHref: '/dashboard?tab=charts',
      formatBroken: (count, pct) => `${count} broken (${pct})`,
      formatMissingH1: (count, pct) => `${count} h1 (${pct})`,
      formatSuccess: (rate) => `success ${rate}`,
      formatThinContent: (median) => `thin ${median}`,
      formatSlowResponse: (ms) => `slow ${ms}`,
    });
    expect(concerns[0]?.id).toBe('broken');
    expect(concerns.length).toBeLessThanOrEqual(3);
  });
});
