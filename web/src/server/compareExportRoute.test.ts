import { describe, expect, it, vi, beforeEach } from 'vitest';
import { localRequest } from '@/server/testHelpers/routeTestUtils';

const queryMock = vi.fn();

vi.mock('@/server/db', () => ({
  withDb: async (fn: (client: { query: typeof queryMock }) => Promise<unknown>) =>
    fn({ query: queryMock }),
}));

describe('compare/export route', () => {
  beforeEach(() => {
    queryMock.mockReset();
    vi.resetModules();
  });

  it('returns 400 when report ids missing', async () => {
    const { POST } = await import('../../app/api/compare/export/route');
    const res = await POST(
      localRequest('/api/compare/export', {
        method: 'POST',
        body: JSON.stringify({ reportIdA: 0, reportIdB: 2 }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('uses buildIssueDeltas keying (trailing slash normalized)', async () => {
    const category = { id: 'tech', name: 'Technical', issues: [] as Array<{
      url?: string;
      message?: string;
      priority?: string;
    }> };

    const payloadA = {
      categories: [
        {
          ...category,
          issues: [
            {
              url: 'https://example.com/page',
              message: 'Missing title',
              priority: 'High',
            },
          ],
        },
      ],
    };
    const payloadB = {
      categories: [
        {
          ...category,
          issues: [
            {
              url: 'https://example.com/page/',
              message: 'Missing title',
              priority: 'High',
            },
          ],
        },
      ],
    };

    queryMock
      .mockResolvedValueOnce({ rows: [{ data: payloadA }] })
      .mockResolvedValueOnce({ rows: [{ data: payloadB }] });

    const { POST } = await import('../../app/api/compare/export/route');
    const res = await POST(
      localRequest('/api/compare/export', {
        method: 'POST',
        body: JSON.stringify({ reportIdA: 1, reportIdB: 2 }),
      }),
    );
    expect(res.status).toBe(200);
    const csv = await res.text();
    const dataLines = csv.trim().split('\n').slice(1);
    expect(dataLines.length).toBe(0);
  });

  it('reports added and removed issues', async () => {
    const cat = { id: 'seo', name: 'SEO', issues: [] as Array<{
      url?: string;
      message?: string;
      priority?: string;
    }> };

    queryMock
      .mockResolvedValueOnce({
        rows: [{
          data: {
            categories: [{
              ...cat,
              issues: [{ url: 'https://a.com/', message: 'issue one', priority: 'High' }],
            }],
          },
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          data: {
            categories: [{
              ...cat,
              issues: [{ url: 'https://b.com/', message: 'issue two', priority: 'Medium' }],
            }],
          },
        }],
      });

    const { POST } = await import('../../app/api/compare/export/route');
    const res = await POST(
      localRequest('/api/compare/export', {
        method: 'POST',
        body: JSON.stringify({ reportIdA: 10, reportIdB: 20 }),
      }),
    );
    const csv = await res.text();
    expect(csv).toContain('removed');
    expect(csv).toContain('added');
    expect(csv).toContain('issue one');
    expect(csv).toContain('issue two');
  });
});
