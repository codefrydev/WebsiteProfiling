import { describe, expect, it, vi, beforeEach } from 'vitest';
import { localRequest, remoteRequest } from '@/server/testHelpers/routeTestUtils';

const proxyMock = vi.fn();
vi.mock('@/server/proxyToFastAPI', () => ({ proxyToFastAPI: (...a: unknown[]) => proxyMock(...a) }));

describe('backlinks/third-party-import route proxy', () => {
  beforeEach(() => { proxyMock.mockReset(); vi.resetModules(); proxyMock.mockResolvedValue(new Response('{}', { status: 200 })); });
  it('returns 403 for non-local', async () => {
    const { POST } = await import('../../app/api/backlinks/third-party-import/route');
    const res = await POST(remoteRequest('/api/backlinks/third-party-import', { method: 'POST' }));
    expect(res.status).toBe(403);
  });
  it('proxies POST to FastAPI', async () => {
    const { POST } = await import('../../app/api/backlinks/third-party-import/route');
    const req = localRequest('/api/backlinks/third-party-import', { method: 'POST', body: '{}' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(proxyMock).toHaveBeenCalledWith(req, '/api/backlinks/third-party-import');
  });
});
