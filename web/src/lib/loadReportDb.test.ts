import { describe, expect, it, vi, beforeEach } from 'vitest';
type PoolClient = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };
import { readReportPayloadFromDatabase } from './loadReportDb';

function mockClient(queries: Record<string, unknown>): PoolClient {
  return {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      if (String(sql).includes('canonical_domain')) {
        return queries.reportList ?? { rows: [] };
      }
      if (String(sql).includes('FROM report_payload WHERE id')) {
        return queries.reportById ?? { rows: [] };
      }
      if (String(sql).includes('FROM report_payload ORDER BY id')) {
        return queries.latestReport ?? { rows: [] };
      }
      if (String(sql).includes('FROM properties WHERE canonical_domain')) {
        const domain = String(params?.[0] ?? '');
        const id = (queries.propertyByDomain as Record<string, number> | undefined)?.[domain];
        return id != null ? { rows: [{ id: String(id) }] } : { rows: [] };
      }
      if (String(sql).includes('competitor_keyword_gap')) {
        return { rows: [] };
      }
      if (String(sql).includes('google_data')) {
        return { rows: [] };
      }
      if (String(sql).includes('keyword_data')) {
        return { rows: [] };
      }
      if (String(sql).includes('gsc_links_data')) {
        return { rows: [] };
      }
      return { rows: [] };
    }),
  } as unknown as PoolClient;
}

describe('readReportPayloadFromDatabase domain scoping', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('loads latest report for domain when reportId is absent', async () => {
    const client = mockClient({
      reportList: {
        rows: [
          {
            id: 99,
            generated_at: '2026-01-01',
            site_name: 'B Site',
            canonical_domain: 'b.com',
          },
          {
            id: 100,
            generated_at: '2026-02-01',
            site_name: 'A Site',
            canonical_domain: 'a.com',
          },
        ],
      },
      reportById: {
        rows: [{ data: { site_name: 'B Site', canonical_domain: 'b.com', categories: [] } }],
      },
      propertyByDomain: { 'b.com': 5 },
    });

    const payload = await readReportPayloadFromDatabase(client, null, 'b.com');
    expect(payload.site_name).toBe('B Site');
    expect(client.query).toHaveBeenCalledWith(
      'SELECT data FROM report_payload WHERE id = $1',
      [99],
    );
  });

  it('throws when no report matches domain', async () => {
    const client = mockClient({
      reportList: {
        rows: [
          {
            id: 1,
            generated_at: '2026-01-01',
            site_name: 'A',
            canonical_domain: 'a.com',
          },
        ],
      },
    });

    await expect(readReportPayloadFromDatabase(client, null, 'missing.com')).rejects.toThrow(
      'No report for domain',
    );
  });
});
