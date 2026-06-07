import { beforeEach, describe, expect, it, vi } from 'vitest';
import { localRequest, remoteRequest } from '@/server/testHelpers/routeTestUtils';

const cancelMock = vi.fn();

vi.mock('@/server/pipelineJobs', () => ({
  cancelPipelineJob: (...args: unknown[]) => cancelMock(...args),
}));

vi.mock('@/server/auth', () => ({
  requireApiAuth: () => null,
}));

describe('jobs cancel route', () => {
  beforeEach(() => {
    cancelMock.mockReset();
    vi.resetModules();
    cancelMock.mockResolvedValue({ ok: true, status: 'error', error: 'Cancelled by user' });
  });

  it('returns 403 for non-local host', async () => {
    const { POST } = await import('../../app/api/jobs/[id]/cancel/route');
    const res = await POST(remoteRequest('/api/jobs/abc/cancel'), {
      params: Promise.resolve({ id: 'abc' }),
    });
    expect(res.status).toBe(403);
  });

  it('cancels a running job for local request', async () => {
    const { POST } = await import('../../app/api/jobs/[id]/cancel/route');
    const res = await POST(localRequest('/api/jobs/job-1/cancel'), {
      params: Promise.resolve({ id: 'job-1' }),
    });
    expect(res.status).toBe(200);
    expect(cancelMock).toHaveBeenCalledWith('job-1');
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('returns 409 when job is not running', async () => {
    cancelMock.mockResolvedValue({ ok: false, status: 'success', error: 'Job is not running' });
    const { POST } = await import('../../app/api/jobs/[id]/cancel/route');
    const res = await POST(localRequest('/api/jobs/job-1/cancel'), {
      params: Promise.resolve({ id: 'job-1' }),
    });
    expect(res.status).toBe(409);
  });
});
