import { describe, expect, it, vi, beforeEach } from 'vitest';
import { localRequest, remoteRequest } from '@/server/testHelpers/routeTestUtils';

const proxyMock = vi.fn();

vi.mock('@/server/proxyToFastAPI', () => ({
  proxyToFastAPI: (...args: unknown[]) => proxyMock(...args),
}));

describe('logs/upload route proxy', () => {
  beforeEach(() => {
    proxyMock.mockReset();
    vi.resetModules();
    proxyMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  });

  it('returns 403 for non-local host', async () => {
    const { POST } = await import('../../app/api/logs/upload/route');
    const res = await POST(remoteRequest('/api/logs/upload', { method: 'POST' }));
    expect(res.status).toBe(403);
  });

  it('proxies POST to FastAPI for local requests', async () => {
    const { POST } = await import('../../app/api/logs/upload/route');
    const req = localRequest('/api/logs/upload', { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(proxyMock).toHaveBeenCalledWith(req, '/api/logs/upload');
  });
});
