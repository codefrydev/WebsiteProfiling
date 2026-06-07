import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { localRequest, makeSpawnChild, withAuthSecret, authHeaders } from '@/server/testHelpers/routeTestUtils';

const spawnMock = vi.fn();
vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

describe('backlinks/third-party-import route', () => {
  let restoreAuth: () => void;

  beforeEach(() => {
    spawnMock.mockReset();
    vi.resetModules();
    restoreAuth = withAuthSecret();
  });

  afterEach(() => {
    restoreAuth();
  });

  it('returns 400 for invalid provider', async () => {
    const headers = await authHeaders();
    const { POST } = await import('../../app/api/backlinks/third-party-import/route');
    const res = await POST(
      localRequest('/api/backlinks/third-party-import', {
        method: 'POST',
        headers,
        body: JSON.stringify({ propertyId: 1, provider: 'ahrefs', csvText: 'a,b\n1,2\n' }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/moz or majestic/i);
  });

  it('returns 400 when propertyId missing', async () => {
    const headers = await authHeaders();
    const { POST } = await import('../../app/api/backlinks/third-party-import/route');
    const res = await POST(
      localRequest('/api/backlinks/third-party-import', {
        method: 'POST',
        headers,
        body: JSON.stringify({ provider: 'moz', csvText: 'Domain,Links\na.com,1\n' }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns overlay result on success', async () => {
    spawnMock.mockImplementation(() =>
      makeSpawnChild(JSON.stringify({ ok: true, imported_domains: 2 }) + '\n', 0),
    );
    const headers = await authHeaders();
    const { POST } = await import('../../app/api/backlinks/third-party-import/route');
    const res = await POST(
      localRequest('/api/backlinks/third-party-import', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          propertyId: 1,
          provider: 'moz',
          csvText: 'Domain,Links\na.com,1\n',
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
