import { describe, expect, it, vi, beforeEach } from 'vitest';
import { localRequest, remoteRequest } from '@/server/testHelpers/routeTestUtils';

const proxyMock = vi.fn();
vi.mock('@/server/proxyToFastAPI', () => ({ proxyToFastAPI: (...a: unknown[]) => proxyMock(...a) }));

describe('report/export-sitemap route proxy', () => {
  beforeEach(() => { proxyMock.mockReset(); vi.resetModules(); proxyMock.mockResolvedValue(new Response('<xml/>', { status: 200 })); });
  it('returns 403 for non-local', async () => {
    const { GET } = await import('../../app/api/report/export-sitemap/route');
    const res = await GET(remoteRequest('/api/report/export-sitemap'));
    expect(res.status).toBe(403);
  });
  it('proxies GET to FastAPI', async () => {
    const { GET } = await import('../../app/api/report/export-sitemap/route');
    const req = localRequest('/api/report/export-sitemap');
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(proxyMock).toHaveBeenCalledWith(req, '/api/report/export-sitemap');
  });
});
