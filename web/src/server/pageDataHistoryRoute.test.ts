import { describe, expect, it, vi, beforeEach } from 'vitest';
import { localRequest } from '@/server/testHelpers/routeTestUtils';

const queryMock = vi.fn();

vi.mock('@/server/db', () => ({
  withDb: async (fn: (client: { query: typeof queryMock }) => Promise<unknown>) =>
    fn({ query: queryMock }),
}));

vi.mock('@/server/resolvePropertyId', () => ({
  resolvePropertyIdFromRequest: vi.fn(async (propertyIdRaw: string | null) => {
    if (propertyIdRaw === '3') return { propertyId: 3 };
    return { propertyId: null, error: 'missing' };
  }),
}));

describe('integrations/google/page-data/history route', () => {
  beforeEach(() => {
    queryMock.mockReset();
    vi.resetModules();
  });

  it('returns 400 when url missing', async () => {
    const { GET } = await import('../../app/api/integrations/google/page-data/history/route');
    const res = await GET(localRequest('/api/integrations/google/page-data/history'));
    expect(res.status).toBe(400);
  });

  it('queries google_data scoped by property_id', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const { GET } = await import('../../app/api/integrations/google/page-data/history/route');
    const res = await GET(
      localRequest(
        '/api/integrations/google/page-data/history?url=https://example.com/page&propertyId=3',
      ),
    );
    expect(res.status).toBe(200);
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('WHERE property_id = $1'),
      [3],
    );
  });
});
