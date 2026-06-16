import { describe, expect, it } from 'vitest';
import { GET, PUT } from '../../app/api/secrets/route';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { localRequest, remoteRequest } from '@/server/testHelpers/routeTestUtils';

describe('/api/secrets route guards', () => {
  it('rejects non-local hosts', () => {
    const denied = forbiddenIfNotLocal(remoteRequest('/api/secrets'));
    expect(denied?.status).toBe(403);
  });

  it('GET returns 403 for remote host', async () => {
    const res = await GET(remoteRequest('/api/secrets'));
    expect(res.status).toBe(403);
  });

  it('PUT returns 400 for invalid JSON', async () => {
    const res = await PUT(
      localRequest('/api/secrets', {
        method: 'PUT',
        body: 'not-json',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(res.status).toBe(400);
  });
});
