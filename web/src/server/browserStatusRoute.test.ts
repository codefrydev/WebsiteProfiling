import { describe, expect, it, vi, beforeEach } from 'vitest';
import { localRequest, remoteRequest } from '@/server/testHelpers/routeTestUtils';

const proxyMock = vi.fn();
vi.mock('@/server/proxyToFastAPI', () => ({ proxyToFastAPI: (...a: unknown[]) => proxyMock(...a) }));

describe('GET /api/crawl/browser-status proxy', () => {
  beforeEach(() => { proxyMock.mockReset(); vi.resetModules(); proxyMock.mockResolvedValue(new Response(JSON.stringify({ ok: true, available: true }), { status: 200 })); });
  it('returns 403 for non-local', async () => {
    const { GET } = await import('../../app/api/crawl/browser-status/route');
    const res = await GET(remoteRequest('/api/crawl/browser-status'));
    expect(res.status).toBe(403);
  });
  it('proxies GET to FastAPI', async () => {
    const { GET } = await import('../../app/api/crawl/browser-status/route');
    const req = localRequest('/api/crawl/browser-status');
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(proxyMock).toHaveBeenCalledWith(req, '/api/crawl/browser-status');
  });
});
