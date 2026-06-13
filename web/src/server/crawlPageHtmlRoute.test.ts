import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { localRequest } from '@/server/testHelpers/routeTestUtils';

const withReportDbMock = vi.fn();

vi.mock('@/server/reportDb', () => ({
  withReportDb: (fn: (client: unknown) => Promise<unknown>) => withReportDbMock(fn),
}));

describe('/api/crawl/page-html', () => {
  beforeEach(() => {
    withReportDbMock.mockReset();
    vi.resetModules();
  });

  it('GET returns runs with stats', async () => {
    withReportDbMock.mockImplementation(async (fn) =>
      fn({
        query: vi.fn(),
      }),
    );
    const loadMod = await import('@/lib/loadReportDb');
    vi.spyOn(loadMod, 'listCrawlPageHtmlRuns').mockResolvedValue([
      {
        crawl_run_id: 3,
        start_url: 'https://example.com',
        created_at: '2026-06-01',
        page_count: 12,
        total_bytes: 4096,
      },
    ]);

    const { GET } = await import('../../app/api/crawl/page-html/route');
    const res = await GET(localRequest('/api/crawl/page-html'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.runs).toHaveLength(1);
    expect(body.runs[0].crawl_run_id).toBe(3);
    expect(body.runs[0].page_count).toBe(12);
  });

  it('DELETE removes HTML for a crawl run', async () => {
    withReportDbMock.mockImplementation(async (fn) => fn({}));
    const loadMod = await import('@/lib/loadReportDb');
    vi.spyOn(loadMod, 'deletePageHtmlForRun').mockResolvedValue(5);

    const { DELETE } = await import('../../app/api/crawl/page-html/route');
    const res = await DELETE(
      localRequest('/api/crawl/page-html', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crawlRunId: 7 }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.deletedPages).toBe(5);
    expect(body.crawlRunId).toBe(7);
  });

  it('DELETE requires crawlRunId', async () => {
    const { DELETE } = await import('../../app/api/crawl/page-html/route');
    const res = await DELETE(
      localRequest('/api/crawl/page-html', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('rejects non-local hosts', async () => {
    const { GET } = await import('../../app/api/crawl/page-html/route');
    const res = await GET(new NextRequest('http://192.168.1.5:3000/api/crawl/page-html'));
    expect(res.status).toBe(403);
  });
});
