import { describe, expect, it } from 'vitest';
import {
  computeCrawlOnlyGroups,
  computeDomainGroups,
  computePortfolioSummary,
} from './homePortfolio';
import type { CrawlRunSummary, PortfolioGroup, ReportListRow, ReportPayload } from '@/types/report';

describe('computeCrawlOnlyGroups', () => {
  it('skips crawl runs that already have a report card', () => {
    const reportGroups: PortfolioGroup[] = [
      {
        domainName: 'codefrydev.in',
        crawlUrl: 'https://codefrydev.in',
        urlCount: 10,
        healthScore: 80,
        statusCounts: { s2xx: 10, s3xx: 0, s4xx: 0, s5xx: 0, other: 0 },
        lastCrawl: '',
        lastAudit: '',
        totalIssues: 0,
        issueCounts: { critical: 0, high: 0, medium: 0, low: 0 },
        successRate: null,
        titleCoverage: null,
        avgWordCount: null,
        thinPages: null,
        technicalSeoScore: null,
        perfScore: null,
        seoScore: null,
        crawlDurationS: null,
        categorySnapshots: [],
        seoSignals: null,
        securityFindings: 0,
        duplicateClusters: 0,
        medianWordCount: null,
        medianResponseMs: null,
        reportId: 1,
        crawlRunId: 1,
        generatedAtMs: 1000,
        domainParam: 'codefrydev.in',
      },
    ];
    const crawlSummaries: CrawlRunSummary[] = [
      {
        crawl_run_id: 1,
        start_url: 'https://codefrydev.in',
        url_count: 10,
        s2xx: 10,
        s3xx: 0,
        s4xx: 0,
        s5xx: 0,
        other: 0,
        created_at: '2026-01-02',
        with_title: 10,
        avg_word_count: 420,
        thin_pages: 1,
      },
    ];
    const crawlOnly = computeCrawlOnlyGroups(crawlSummaries, reportGroups, 'Unknown', '—');
    expect(crawlOnly).toHaveLength(0);
  });

  it('populates crawlConfig from crawl run mode fields', () => {
    const crawlSummaries: CrawlRunSummary[] = [
      {
        crawl_run_id: 2,
        start_url: 'https://example.com',
        url_count: 15,
        s2xx: 15,
        s3xx: 0,
        s4xx: 0,
        s5xx: 0,
        other: 0,
        created_at: '2026-01-02',
        with_title: 10,
        avg_word_count: 420,
        thin_pages: 1,
        render_mode: 'auto',
        discovery_mode: 'sitemap',
      },
    ];
    const crawlOnly = computeCrawlOnlyGroups(crawlSummaries, [], 'Unknown', '—');
    expect(crawlOnly).toHaveLength(1);
    expect(crawlOnly[0]?.crawlConfig).toEqual({
      pages_crawled: 15,
      render_mode: 'auto',
      discovery_mode: 'sitemap',
    });
  });
});

describe('computeDomainGroups', () => {
  it('populates crawlConfig and dataSources from report payload', async () => {
    const reportList: ReportListRow[] = [
      {
        id: 1,
        generated_at: '2026-01-03T00:00:00Z',
        site_name: 'Example',
        canonical_domain: 'example.com',
      },
    ];
    const payload: ReportPayload = {
      crawl_run_id: 5,
      report_meta: {
        data_sources: ['crawl', 'lighthouse', 'search_console'],
        crawl_scope: {
          pages_crawled: 100,
          max_pages_configured: 500,
          render_mode: 'static',
          crawl_limited: false,
        },
      },
      categories: [{ id: 'technical_seo', name: 'Tech SEO', score: 80, issues: [] }],
      summary: { total_urls: 100 },
    };
    const groups = await computeDomainGroups(
      reportList,
      new Map([[5, 'https://example.com']]),
      new Map([[5, '2026-01-02T00:00:00Z']]),
      'Unknown',
      '—',
      async () => payload,
      new Map([[5, { discovery_mode: 'spider' }]]),
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.crawlConfig).toMatchObject({
      pages_crawled: 100,
      max_pages_configured: 500,
      render_mode: 'static',
      discovery_mode: 'spider',
    });
    expect(groups[0]?.dataSources).toEqual(['crawl', 'lighthouse', 'search_console']);
  });
});

describe('computePortfolioSummary', () => {
  it('aggregates brand count, urls, and average health', () => {
    const groups: PortfolioGroup[] = [
      {
        domainName: 'a.com',
        crawlUrl: 'https://a.com',
        urlCount: 10,
        healthScore: 80,
        statusCounts: { s2xx: 10, s3xx: 0, s4xx: 0, s5xx: 0, other: 0 },
        lastCrawl: '',
        lastAudit: '',
        totalIssues: 0,
        issueCounts: { critical: 0, high: 0, medium: 0, low: 0 },
        successRate: null,
        titleCoverage: null,
        avgWordCount: null,
        thinPages: null,
        technicalSeoScore: null,
        perfScore: null,
        seoScore: null,
        crawlDurationS: null,
        categorySnapshots: [],
        seoSignals: null,
        securityFindings: 0,
        duplicateClusters: 0,
        medianWordCount: null,
        medianResponseMs: null,
        reportId: 1,
        generatedAtMs: 1000,
        domainParam: 'a.com',
      },
      {
        domainName: 'b.com',
        crawlUrl: 'https://b.com',
        urlCount: 20,
        healthScore: 60,
        statusCounts: { s2xx: 20, s3xx: 0, s4xx: 0, s5xx: 0, other: 0 },
        lastCrawl: '',
        lastAudit: '',
        totalIssues: 0,
        issueCounts: { critical: 0, high: 0, medium: 0, low: 0 },
        successRate: null,
        titleCoverage: null,
        avgWordCount: null,
        thinPages: null,
        technicalSeoScore: null,
        perfScore: null,
        seoScore: null,
        crawlDurationS: null,
        categorySnapshots: [],
        seoSignals: null,
        securityFindings: 0,
        duplicateClusters: 0,
        medianWordCount: null,
        medianResponseMs: null,
        reportId: 2,
        generatedAtMs: 900,
        domainParam: 'b.com',
      },
    ];
    expect(computePortfolioSummary(groups)).toEqual({
      totalBrands: 2,
      totalUrls: 30,
      avgHealth: 70,
    });
  });

  it('returns null avgHealth for empty groups', () => {
    expect(computePortfolioSummary([])).toEqual({
      totalBrands: 0,
      totalUrls: 0,
      avgHealth: null,
    });
  });
});
