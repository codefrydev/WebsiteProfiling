import { describe, expect, it, vi, beforeEach } from 'vitest';
import { localRequest, remoteRequest } from '@/server/testHelpers/routeTestUtils';

const proxyMock = vi.fn();

vi.mock('@/server/proxyToFastAPI', () => ({
  proxyToFastAPI: (...args: unknown[]) => proxyMock(...args),
}));

describe('keywords/competitor-import route proxy', () => {
  beforeEach(() => {
    proxyMock.mockReset();
    vi.resetModules();
    proxyMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  });

  it('returns 403 for non-local host', async () => {
    const { POST } = await import('../../app/api/keywords/competitor-import/route');
    const res = await POST(
      remoteRequest('/api/keywords/competitor-import', {
        method: 'POST',
        body: JSON.stringify({ csvText: 'a,b' }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it('proxies POST to FastAPI for local requests', async () => {
    const { POST } = await import('../../app/api/keywords/competitor-import/route');
    const req = localRequest('/api/keywords/competitor-import', {
      method: 'POST',
      body: JSON.stringify({ csvText: 'keyword,volume\ntest,100' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(proxyMock).toHaveBeenCalledWith(req, '/api/keywords/competitor-import');
  });
});
