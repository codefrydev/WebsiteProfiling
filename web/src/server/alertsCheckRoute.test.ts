import { describe, expect, it, vi, beforeEach } from 'vitest';
import { localRequest, remoteRequest, makeSpawnChild } from '@/server/testHelpers/routeTestUtils';

const spawnMock = vi.fn();
vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

describe('alerts/check route', () => {
  beforeEach(() => {
    spawnMock.mockReset();
    vi.resetModules();
  });

  it('returns 403 for non-local host', async () => {
    const { POST } = await import('../../app/api/alerts/check/route');
    const res = await POST(remoteRequest('/api/alerts/check?propertyId=1', { method: 'POST' }));
    expect(res.status).toBe(403);
  });

  it('returns 400 without propertyId', async () => {
    const { POST } = await import('../../app/api/alerts/check/route');
    const res = await POST(localRequest('/api/alerts/check', { method: 'POST' }));
    expect(res.status).toBe(400);
  });

  it('returns alerts from Python', async () => {
    spawnMock.mockImplementation(() =>
      makeSpawnChild(JSON.stringify({ alerts: [{ type: 'health_drop' }], webhook_sent: false }) + '\n', 0),
    );
    const { POST } = await import('../../app/api/alerts/check/route');
    const res = await POST(localRequest('/api/alerts/check?propertyId=3', { method: 'POST' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.alerts).toHaveLength(1);
  });
});
