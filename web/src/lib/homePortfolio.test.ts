import { describe, expect, it } from 'vitest';
import { computeCrawlOnlyGroups } from './homePortfolio';
import type { CrawlRunSummary, PortfolioGroup } from '@/types/report';

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
      },
    ];
    const crawlOnly = computeCrawlOnlyGroups(crawlSummaries, reportGroups, 'Unknown', '—');
    expect(crawlOnly).toHaveLength(0);
  });
});
