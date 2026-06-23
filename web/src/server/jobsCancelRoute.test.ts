import { describe, expect, it, vi, beforeEach } from 'vitest';
import { localRequest, remoteRequest } from '@/server/testHelpers/routeTestUtils';

const proxyMock = vi.fn();

vi.mock('@/server/proxyToFastAPI', () => ({
  proxyToFastAPI: (...args: unknown[]) => proxyMock(...args),
}));

vi.mock('@/server/auth', () => ({
  requireApiAuth: () => null,
}));

describe('jobs cancel route proxy', () => {
  beforeEach(() => {
    proxyMock.mockReset();
    vi.resetModules();
    proxyMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, status: 'error', error: 'Cancelled by user' }), { status: 200 }),
    );
  });

  it('returns 403 for non-local host', async () => {
    const { POST } = await import('../../app/api/jobs/[id]/cancel/route');
    const res = await POST(remoteRequest('/api/jobs/job-1/cancel'), {
      params: Promise.resolve({ id: 'job-1' }),
    });
    expect(res.status).toBe(403);
  });

  it('proxies POST to FastAPI', async () => {
    const { POST } = await import('../../app/api/jobs/[id]/cancel/route');
    const req = localRequest('/api/jobs/job-1/cancel');
    const res = await POST(req, { params: Promise.resolve({ id: 'job-1' }) });
    expect(res.status).toBe(200);
    expect(proxyMock).toHaveBeenCalledWith(req, '/api/jobs/job-1/cancel');
  });
});
