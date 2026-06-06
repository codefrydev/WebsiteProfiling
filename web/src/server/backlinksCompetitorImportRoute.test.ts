import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { localRequest, makeSpawnChild, withAuthSecret, authHeaders } from '@/server/testHelpers/routeTestUtils';

const spawnMock = vi.fn();
vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

describe('backlinks/competitor-import route', () => {
  let restoreAuth: () => void;

  beforeEach(() => {
    spawnMock.mockReset();
    vi.resetModules();
    restoreAuth = withAuthSecret();
  });

  afterEach(() => {
    restoreAuth();
  });

  it('returns 401 when auth enabled and no session', async () => {
    const { POST } = await import('../../app/api/backlinks/competitor-import/route');
    const res = await POST(
      localRequest('/api/backlinks/competitor-import', {
        method: 'POST',
        body: JSON.stringify({ competitor: 'rival.com', csvText: 'Site,Links\na.com,1\n' }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when csvText missing', async () => {
    const headers = await authHeaders();
    const { POST } = await import('../../app/api/backlinks/competitor-import/route');
    const res = await POST(
      localRequest('/api/backlinks/competitor-import', {
        method: 'POST',
        headers,
        body: JSON.stringify({ competitor: 'rival.com', csvText: '  ' }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns gap analysis on success', async () => {
    spawnMock.mockImplementation(() =>
      makeSpawnChild(JSON.stringify({ competitor: 'rival.com', gap_count: 1, gap_domains: ['x.com'] }) + '\n', 0),
    );
    const headers = await authHeaders();
    const { POST } = await import('../../app/api/backlinks/competitor-import/route');
    const res = await POST(
      localRequest('/api/backlinks/competitor-import', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          competitor: 'rival.com',
          csvText: 'Site,Links\nx.com,2\n',
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.gap.gap_count).toBe(1);
  });
});
