import { describe, expect, it, vi, beforeEach } from 'vitest';
import { localRequest, remoteRequest } from '@/server/testHelpers/routeTestUtils';

const reconcileMock = vi.fn();
const listJobsMock = vi.fn();
const activeJobMock = vi.fn();

vi.mock('@/server/pipelineJobsDb', () => ({
  reconcileStaleRunningJobs: (...args: unknown[]) => reconcileMock(...args),
  listRecentPipelineJobs: (...args: unknown[]) => listJobsMock(...args),
  getActiveRunningJob: (...args: unknown[]) => activeJobMock(...args),
}));

describe('jobs route', () => {
  beforeEach(() => {
    reconcileMock.mockReset();
    listJobsMock.mockReset();
    activeJobMock.mockReset();
    vi.resetModules();
    reconcileMock.mockResolvedValue(0);
    listJobsMock.mockResolvedValue([{ id: 'j1', status: 'completed' }]);
    activeJobMock.mockResolvedValue(null);
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
