import { describe, expect, it, vi, beforeEach } from 'vitest';
import { localRequest, remoteRequest } from '@/server/testHelpers/routeTestUtils';

const proxyMock = vi.fn();
vi.mock('@/server/proxyToFastAPI', () => ({ proxyToFastAPI: (...a: unknown[]) => proxyMock(...a) }));

describe('POST /api/properties/[id]/google/links/import proxy', () => {
  beforeEach(() => { proxyMock.mockReset(); vi.resetModules(); proxyMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 })); });
  it('returns 403 for non-local', async () => {
    const { POST } = await import('../../app/api/properties/[id]/google/links/import/route');
    const res = await POST(remoteRequest('/api/properties/1/google/links/import', { method: 'POST' }), { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(403);
  });
  it('proxies POST to FastAPI', async () => {
    const { POST } = await import('../../app/api/properties/[id]/google/links/import/route');
    const req = localRequest('/api/properties/1/google/links/import', { method: 'POST' });
    const res = await POST(req, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(200);
    expect(proxyMock).toHaveBeenCalledWith(req, '/api/properties/1/google/links/import');
  });
});
