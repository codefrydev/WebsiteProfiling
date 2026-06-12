import { describe, expect, it, vi, beforeEach } from 'vitest';
import { localRequest, remoteRequest } from '@/server/testHelpers/routeTestUtils';

const listForApiMock = vi.fn();

vi.mock('@/server/pipelineJobs', () => ({
  listPipelineJobsForApi: (...args: unknown[]) => listForApiMock(...args),
}));

describe('jobs route', () => {
  beforeEach(() => {
    listForApiMock.mockReset();
    vi.resetModules();
    listForApiMock.mockResolvedValue({
      jobs: [{ id: 'j1', status: 'completed' }],
      active: null,
      reconciled: 0,
    });
  });

  it('returns 403 for non-local host', async () => {
    const { GET } = await import('../../app/api/jobs/route');
    const res = await GET(remoteRequest('/api/jobs'));
    expect(res.status).toBe(403);
  });

  it('lists jobs for local request', async () => {
    const { GET } = await import('../../app/api/jobs/route');
    const res = await GET(localRequest('/api/jobs?limit=10'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobs).toHaveLength(1);
    expect(body.reconciled).toBe(0);
  });
});
