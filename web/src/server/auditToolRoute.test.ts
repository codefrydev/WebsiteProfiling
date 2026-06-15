import { describe, expect, it, vi, beforeEach } from 'vitest';
import { localRequest, remoteRequest, makeSpawnChild, makeSpawnError } from '@/server/testHelpers/routeTestUtils';

const spawnMock = vi.fn();
vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

describe('report/audit-tool route', () => {
  beforeEach(() => {
    spawnMock.mockReset();
    vi.resetModules();
  });

  it('returns 403 for non-local host', async () => {
    const { POST } = await import('../../app/api/report/audit-tool/route');
    const res = await POST(
      remoteRequest('/api/report/audit-tool', {
        method: 'POST',
        body: JSON.stringify({ toolName: 'get_axe_audit_summary', propertyId: 1 }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 without toolName or propertyId', async () => {
    const { POST } = await import('../../app/api/report/audit-tool/route');
    const res = await POST(
      localRequest('/api/report/audit-tool', {
        method: 'POST',
        body: JSON.stringify({ toolName: 'get_axe_audit_summary' }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for disallowed tool', async () => {
    const { POST } = await import('../../app/api/report/audit-tool/route');
    const res = await POST(
      localRequest('/api/report/audit-tool', {
        method: 'POST',
        body: JSON.stringify({ toolName: 'export_audit_report', propertyId: 1 }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not allowed/i);
  });

  it('returns tool JSON from Python', async () => {
    spawnMock.mockImplementation(() =>
      makeSpawnChild(JSON.stringify({ pages_with_violations: 2, total_violations: 5 }) + '\n', 0),
    );
    const { POST } = await import('../../app/api/report/audit-tool/route');
    const res = await POST(
      localRequest('/api/report/audit-tool', {
        method: 'POST',
        body: JSON.stringify({ toolName: 'get_axe_audit_summary', propertyId: 3, reportId: 10 }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pages_with_violations).toBe(2);
  });

  it('returns 500 when Python fails to spawn', async () => {
    spawnMock.mockImplementation(() => makeSpawnError('spawn python3 ENOENT'));
    const { POST } = await import('../../app/api/report/audit-tool/route');
    const res = await POST(
      localRequest('/api/report/audit-tool', {
        method: 'POST',
        body: JSON.stringify({ toolName: 'get_geo_readiness_score', propertyId: 1 }),
      }),
    );
    expect(res.status).toBe(500);
  });
});
