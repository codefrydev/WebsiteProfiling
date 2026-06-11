import { describe, expect, it } from 'vitest';
import { buildCrawlHistoryByDomain, crawlHistorySeries } from './portfolioCrawlHistory';
import type { CrawlRunSummary } from '@/types/report';

describe('buildCrawlHistoryByDomain', () => {
  it('groups runs by hostname and orders oldest to newest', () => {
    const summaries: CrawlRunSummary[] = [
      {
        crawl_run_id: 2,
        start_url: 'https://fetch.example.com',
        created_at: '2026-06-10T10:00:00Z',
        url_count: 4,
        s2xx: 4,
        s3xx: 0,
        s4xx: 0,
        s5xx: 0,
        other: 0,
        with_title: 4,
        avg_word_count: 500,
        thin_pages: 0,
      },
      {
        crawl_run_id: 1,
        start_url: 'https://fetch.example.com',
        created_at: '2026-06-09T10:00:00Z',
        url_count: 2,
        s2xx: 2,
        s3xx: 0,
        s4xx: 0,
        s5xx: 0,
        other: 0,
        with_title: 1,
        avg_word_count: 320,
        thin_pages: 1,
      },
    ];

    const history = buildCrawlHistoryByDomain(summaries);
    const points = history['fetch.example.com'];
    expect(points).toHaveLength(2);
    expect(points[0].pagesDiscovered).toBe(2);
    expect(points[0].titleCoverage).toBe(50);
    expect(points[1].pagesDiscovered).toBe(4);
    expect(crawlHistorySeries(points, 'avgWordCount')).toEqual([320, 500]);
  });
});
