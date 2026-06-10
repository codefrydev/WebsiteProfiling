import { describe, expect, it } from 'vitest';
import { derivePortfolioCardTrends, portfolioCardKey } from './portfolioCardUtils';
import type { PortfolioGroup } from '@/types';

const baseGroup: PortfolioGroup = {
  domainName: 'codefrydev.in',
  crawlUrl: 'https://codefrydev.in',
  urlCount: 30,
  healthScore: 70,
  statusCounts: { s2xx: 30, s3xx: 0, s4xx: 0, s5xx: 0, other: 0 },
  lastCrawl: '',
  lastAudit: '',
  totalIssues: 101,
  issueCounts: { critical: 2, high: 10, medium: 50, low: 39 },
  successRate: null,
  titleCoverage: null,
  avgWordCount: null,
  thinPages: null,
  technicalSeoScore: 50,
  perfScore: 1,
  seoScore: 80,
  crawlDurationS: null,
  categorySnapshots: [],
  seoSignals: { missingTitles: 3, missingMetaDesc: 1, thinContent: 0, h1Issues: 0 },
  securityFindings: 0,
  duplicateClusters: 0,
  medianWordCount: null,
  medianResponseMs: null,
  reportId: 1,
  generatedAtMs: 1000,
  domainParam: 'codefrydev.in',
  crawlConfig: {
    render_mode: 'auto',
    discovery_mode: 'spider',
    pages_crawled: 30,
    max_pages_configured: 500,
  },
  dataSources: ['crawl', 'lighthouse'],
};

describe('portfolioCardKey', () => {
  it('builds stable keys for report cards', () => {
    expect(portfolioCardKey(baseGroup)).toBe('codefrydev.in-report-1-nc-1000');
  });
});

describe('derivePortfolioCardTrends', () => {
  it('computes health delta and urgent count', () => {
    const trends = derivePortfolioCardTrends(
      baseGroup,
      [
        { healthScore: 69, totalIssues: 90, urgentIssues: 8, perfScore: 2, seoScore: 75, technicalSeoScore: 48 },
        { healthScore: 70, totalIssues: 101, urgentIssues: 12, perfScore: 1, seoScore: 80, technicalSeoScore: 50 },
      ],
      [],
      {
        missingTitlesLabel: 'Missing titles',
        missingMetaLabel: 'Missing meta',
        thinPagesLabel: 'Thin pages',
        h1IssuesLabel: 'H1 issues',
      },
    );
    expect(trends.healthDelta).toBe(1);
    expect(trends.urgentCount).toBe(12);
    expect(trends.seoSignalItems).toHaveLength(2);
  });
});
