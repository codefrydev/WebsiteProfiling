import { describe, expect, it, vi, beforeEach } from 'vitest';
import { localRequest, remoteRequest } from '@/server/testHelpers/routeTestUtils';

const proxyMock = vi.fn();

vi.mock('@/server/proxyToFastAPI', () => ({
  proxyToFastAPI: (...args: unknown[]) => proxyMock(...args),
}));

describe('jobs route proxy', () => {
  beforeEach(() => {
    proxyMock.mockReset();
    vi.resetModules();
    proxyMock.mockResolvedValue(
      new Response(
        JSON.stringify({ jobs: [{ id: 'j1', status: 'completed' }], active: null, reconciled: 0 }),
        { status: 200 },
      ),
    );
  });

  it('returns 403 for non-local host', async () => {
    const { GET } = await import('../../app/api/jobs/route');
    const res = await GET(remoteRequest('/api/jobs'));
    expect(res.status).toBe(403);
  });

  it('proxies GET to FastAPI', async () => {
    const { GET } = await import('../../app/api/jobs/route');
    const req = localRequest('/api/jobs?limit=10');
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(proxyMock).toHaveBeenCalledWith(req, '/api/jobs');
  });
});
