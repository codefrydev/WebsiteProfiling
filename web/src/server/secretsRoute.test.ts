import { describe, expect, it, vi, beforeEach } from 'vitest';
import { localRequest, remoteRequest } from '@/server/testHelpers/routeTestUtils';

const proxyMock = vi.fn();

vi.mock('@/server/proxyToFastAPI', () => ({
  proxyToFastAPI: (...args: unknown[]) => proxyMock(...args),
}));

describe('/api/secrets route proxy', () => {
  beforeEach(() => {
    proxyMock.mockReset();
    vi.resetModules();
    proxyMock.mockResolvedValue(new Response(JSON.stringify({ state: {} }), { status: 200 }));
  });

  it('GET returns 403 for remote host', async () => {
    const { GET } = await import('../../app/api/secrets/route');
    const res = await GET(remoteRequest('/api/secrets'));
    expect(res.status).toBe(403);
  });

  it('PUT returns 403 for remote host', async () => {
    const { PUT } = await import('../../app/api/secrets/route');
    const res = await PUT(remoteRequest('/api/secrets', { method: 'PUT', body: 'not-json' }));
    expect(res.status).toBe(403);
  });

  it('GET proxies to FastAPI for local request', async () => {
    const { GET } = await import('../../app/api/secrets/route');
    const req = localRequest('/api/secrets');
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(proxyMock).toHaveBeenCalledWith(req, '/api/secrets');
  });

  it('PUT proxies to FastAPI for local request', async () => {
    proxyMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const { PUT } = await import('../../app/api/secrets/route');
    const req = localRequest('/api/secrets', {
      method: 'PUT',
      body: JSON.stringify({ state: {} }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await PUT(req);
    expect(res.status).toBe(200);
    expect(proxyMock).toHaveBeenCalledWith(req, '/api/secrets');
  });
});
