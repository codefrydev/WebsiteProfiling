import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { localRequest, remoteRequest, withAuthSecret, authHeaders } from '@/server/testHelpers/routeTestUtils';

const withDbMock = vi.fn();

vi.mock('@/server/db', () => ({
  withDb: (fn: (client: { query: ReturnType<typeof vi.fn> }) => Promise<unknown>) => withDbMock(fn),
}));

describe('logs/upload route', () => {
  let restoreAuth: () => void;

  beforeEach(() => {
    withDbMock.mockReset();
    vi.resetModules();
    restoreAuth = withAuthSecret();
    withDbMock.mockImplementation(async (fn) => {
      const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      return fn(client);
    });
  });

  afterEach(() => {
    restoreAuth();
  });

  it('returns 403 for non-local host', async () => {
    const headers = await authHeaders();
    const { POST } = await import('../../app/api/logs/upload/route');
    const form = new FormData();
    form.set('propertyId', '1');
    form.set('file', new File(['line'], 'access.log', { type: 'text/plain' }));
    const res = await POST(
      remoteRequest('/api/logs/upload', { method: 'POST', headers, body: form }),
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 when file missing', async () => {
    const headers = await authHeaders();
    const { POST } = await import('../../app/api/logs/upload/route');
    const form = new FormData();
    form.set('propertyId', '1');
    const res = await POST(
      localRequest('/api/logs/upload', { method: 'POST', headers, body: form }),
    );
    expect(res.status).toBe(400);
  });
});
