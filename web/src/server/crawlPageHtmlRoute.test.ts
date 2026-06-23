import { describe, expect, it, vi, beforeEach } from 'vitest';
import { localRequest, remoteRequest } from '@/server/testHelpers/routeTestUtils';

const proxyMock = vi.fn();

vi.mock('@/server/proxyToFastAPI', () => ({
  proxyToFastAPI: (...args: unknown[]) => proxyMock(...args),
}));

describe('/api/crawl/page-html proxy', () => {
  beforeEach(() => {
    proxyMock.mockReset();
    vi.resetModules();
    proxyMock.mockResolvedValue(new Response(JSON.stringify({ html: '<p>Test</p>' }), { status: 200 }));
  });

  it('returns 403 for non-local host', async () => {
    const { GET } = await import('../../app/api/crawl/page-html/route');
    const res = await GET(remoteRequest('/api/crawl/page-html?url=https://example.com'));
    expect(res.status).toBe(403);
  });

  it('proxies GET to FastAPI', async () => {
    const { GET } = await import('../../app/api/crawl/page-html/route');
    const req = localRequest('/api/crawl/page-html?url=https://example.com');
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(proxyMock).toHaveBeenCalledWith(req, '/api/crawl/page-html');
  });
});
