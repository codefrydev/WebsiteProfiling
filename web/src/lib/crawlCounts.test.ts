import { describe, expect, it } from 'vitest';
import { crawlLimitConfigured, crawledUrlCount } from '@/lib/crawlCounts';
import type { ReportPayload } from '@/types/report';

describe('crawledUrlCount', () => {
  it('prefers pages_crawled over summary and links', () => {
    const data = {
      report_meta: { crawl_scope: { pages_crawled: 1138, max_pages_configured: 1500 } },
      summary: { total_urls: 1500 },
      links: Array.from({ length: 1500 }, (_, i) => ({ url: `https://ex.com/${i}` })),
    } as unknown as ReportPayload;
    expect(crawledUrlCount(data)).toBe(1138);
  });

  it('falls back to summary.total_urls', () => {
    const data = {
      summary: { total_urls: 42 },
      links: [{ url: 'https://ex.com' }],
    } as unknown as ReportPayload;
    expect(crawledUrlCount(data)).toBe(42);
  });

  it('never returns max_pages_configured', () => {
    const data = {
      report_meta: { crawl_scope: { max_pages_configured: 1500 } },
    } as unknown as ReportPayload;
    expect(crawledUrlCount(data)).toBe(0);
  });
});

describe('crawlLimitConfigured', () => {
  it('returns configured limit when present', () => {
    const data = {
      report_meta: { crawl_scope: { max_pages_configured: 1500, pages_crawled: 1138 } },
    } as unknown as ReportPayload;
    expect(crawlLimitConfigured(data)).toBe(1500);
  });
});
