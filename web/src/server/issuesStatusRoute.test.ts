import { describe, expect, it, vi, beforeEach } from 'vitest';
import { localRequest, remoteRequest } from '@/server/testHelpers/routeTestUtils';

const proxyMock = vi.fn();

vi.mock('@/server/proxyToFastAPI', () => ({
  proxyToFastAPI: (...args: unknown[]) => proxyMock(...args),
}));

describe('issues/status route proxy', () => {
  beforeEach(() => {
    proxyMock.mockReset();
    vi.resetModules();
    proxyMock.mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
  });

  it('returns 403 for non-local host', async () => {
    const { GET } = await import('../../app/api/issues/status/route');
    const res = await GET(remoteRequest('/api/issues/status'));
    expect(res.status).toBe(403);
  });

  it('proxies GET to FastAPI', async () => {
    const { GET } = await import('../../app/api/issues/status/route');
    const req = localRequest('/api/issues/status');
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(proxyMock).toHaveBeenCalledWith(req, '/api/issues/status');
  });
});
