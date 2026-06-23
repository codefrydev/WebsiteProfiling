import { describe, expect, it, vi, beforeEach } from 'vitest';
import { localRequest, remoteRequest } from '@/server/testHelpers/routeTestUtils';

const proxyMock = vi.fn();

vi.mock('@/server/proxyToFastAPI', () => ({
  proxyToFastAPI: (...args: unknown[]) => proxyMock(...args),
}));

describe('properties/[id]/ops route proxy', () => {
  beforeEach(() => {
    proxyMock.mockReset();
    vi.resetModules();
    proxyMock.mockResolvedValue(
      new Response(
        JSON.stringify({ schedule_cron: '0 9 * * 1', alert_webhook_url: null, alert_email: null }),
        { status: 200 },
      ),
    );
  });

  it('returns 403 for non-local GET', async () => {
    const { GET } = await import('../../app/api/properties/[id]/ops/route');
    const res = await GET(remoteRequest('/api/properties/1/ops'), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(res.status).toBe(403);
  });

  it('proxies GET to FastAPI', async () => {
    const { GET } = await import('../../app/api/properties/[id]/ops/route');
    const req = localRequest('/api/properties/1/ops');
    const res = await GET(req, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(200);
    expect(proxyMock).toHaveBeenCalledWith(req, '/api/properties/1/ops');
  });

  it('proxies PUT to FastAPI', async () => {
    proxyMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const { PUT } = await import('../../app/api/properties/[id]/ops/route');
    const req = localRequest('/api/properties/1/ops', { method: 'PUT', body: JSON.stringify({}) });
    const res = await PUT(req, { params: Promise.resolve({ id: '1' }) });
    expect(res.status).toBe(200);
    expect(proxyMock).toHaveBeenCalledWith(req, '/api/properties/1/ops');
  });
});
