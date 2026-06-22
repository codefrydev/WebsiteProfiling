import { describe, expect, it, vi, beforeEach } from 'vitest';
import { localRequest, remoteRequest } from '@/server/testHelpers/routeTestUtils';

const proxyMock = vi.fn();

vi.mock('@/server/proxyToFastAPI', () => ({
  proxyToFastAPI: (...args: unknown[]) => proxyMock(...args),
}));

describe('integrations/google/page-data/history route proxy', () => {
  beforeEach(() => {
    proxyMock.mockReset();
    vi.resetModules();
    proxyMock.mockResolvedValue(new Response(JSON.stringify({ history: [] }), { status: 200 }));
  });

  it('returns 403 for non-local host', async () => {
    const { GET } = await import('../../app/api/integrations/google/page-data/history/route');
    const res = await GET(remoteRequest('/api/integrations/google/page-data/history?url=https://example.com'));
    expect(res.status).toBe(403);
  });

  it('proxies GET to FastAPI for local requests', async () => {
    const { GET } = await import('../../app/api/integrations/google/page-data/history/route');
    const req = localRequest('/api/integrations/google/page-data/history?url=https://example.com');
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(proxyMock).toHaveBeenCalledWith(req, '/api/integrations/google/page-data/history');
  });
});
