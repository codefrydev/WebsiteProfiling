import { describe, expect, it, vi, beforeEach } from 'vitest';
import { localRequest, remoteRequest } from '@/server/testHelpers/routeTestUtils';

const listIssueStatusMock = vi.fn();
const upsertIssueStatusMock = vi.fn();

vi.mock('@/server/issueStatusDb', () => ({
  listIssueStatus: (...args: unknown[]) => listIssueStatusMock(...args),
  upsertIssueStatus: (...args: unknown[]) => upsertIssueStatusMock(...args),
}));

describe('issues/status route', () => {
  beforeEach(() => {
    listIssueStatusMock.mockReset();
    upsertIssueStatusMock.mockReset();
    vi.resetModules();
    listIssueStatusMock.mockResolvedValue([]);
    upsertIssueStatusMock.mockResolvedValue({ id: 1, status: 'open', message: 'Slow LCP' });
  });

  it('GET returns 400 without propertyId', async () => {
    const { GET } = await import('../../app/api/issues/status/route');
    const res = await GET(localRequest('/api/issues/status'));
    expect(res.status).toBe(400);
  });

  it('GET returns issues for property', async () => {
    listIssueStatusMock.mockResolvedValue([{ id: 1, status: 'open' }]);
    const { GET } = await import('../../app/api/issues/status/route');
    const res = await GET(localRequest('/api/issues/status?propertyId=5'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.issues).toHaveLength(1);
  });

  it('PUT returns 403 for non-local host', async () => {
    const { PUT } = await import('../../app/api/issues/status/route');
    const res = await PUT(
      remoteRequest('/api/issues/status', {
        method: 'PUT',
        body: JSON.stringify({ propertyId: 1, message: 'x', status: 'open' }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it('PUT returns 400 for invalid status', async () => {
    const { PUT } = await import('../../app/api/issues/status/route');
    const res = await PUT(
      localRequest('/api/issues/status', {
        method: 'PUT',
        body: JSON.stringify({ propertyId: 1, message: 'x', status: 'bogus' }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('PUT upserts issue on valid payload', async () => {
    const { PUT } = await import('../../app/api/issues/status/route');
    const res = await PUT(
      localRequest('/api/issues/status', {
        method: 'PUT',
        body: JSON.stringify({ propertyId: 1, message: 'Slow LCP', status: 'in_progress' }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.issue.status).toBe('open');
  });
});
