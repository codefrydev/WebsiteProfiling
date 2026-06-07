import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { localRequest, withAuthSecret, authHeaders } from '@/server/testHelpers/routeTestUtils';

describe('auth/session route', () => {
  let restoreAuth: () => void;

  beforeEach(() => {
    vi.resetModules();
    restoreAuth = withAuthSecret();
  });

  afterEach(() => {
    restoreAuth();
  });

  it('returns canMutate true when auth disabled', async () => {
    restoreAuth();
    delete process.env.AUTH_SECRET;
    const { GET } = await import('../../app/api/auth/session/route');
    const res = await GET(localRequest('/api/auth/session'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authEnabled).toBe(false);
    expect(body.canMutate).toBe(true);
  });

  it('returns readonly for viewer role', async () => {
    const headers = await authHeaders('viewer');
    const { GET } = await import('../../app/api/auth/session/route');
    const res = await GET(localRequest('/api/auth/session', { headers }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe('viewer');
    expect(body.canMutate).toBe(false);
    expect(body.readonly).toBe(true);
  });

  it('returns canMutate for analyst role', async () => {
    const headers = await authHeaders('analyst');
    const { GET } = await import('../../app/api/auth/session/route');
    const res = await GET(localRequest('/api/auth/session', { headers }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.canMutate).toBe(true);
    expect(body.readonly).toBe(false);
  });
});
