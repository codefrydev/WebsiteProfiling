import { describe, expect, it, vi, beforeEach } from 'vitest';
import { localRequest } from '@/server/testHelpers/routeTestUtils';

const spawnMock = vi.fn();
const queryMock = vi.fn();

vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

vi.mock('@/server/db', () => ({
  withDb: async (fn: (client: { query: typeof queryMock }) => Promise<void>) => fn({ query: queryMock }),
}));

describe('keywords/competitor-import route', () => {
  beforeEach(() => {
    spawnMock.mockReset();
    queryMock.mockReset();
    vi.resetModules();
  });

  it('returns 400 when csvText missing', async () => {
    const { POST } = await import('../../app/api/keywords/competitor-import/route');
    const res = await POST(
      localRequest('/api/keywords/competitor-import', {
        method: 'POST',
        body: JSON.stringify({ propertyId: 1, competitor: 'rival.com', csvText: '  ' }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('imports competitor keywords on success', async () => {
    spawnMock.mockImplementation(() => ({
      stdout: { on: (_: string, cb: (c: Buffer) => void) => cb(Buffer.from('{"count":1,"rows":[{"keyword":"kw","competitor":"rival.com"}]}')) },
      stderr: { on: () => undefined },
      stdin: { write: () => undefined, end: () => undefined },
      on: (_: string, cb: (code: number) => void) => cb(0),
    }));
    queryMock.mockResolvedValue(undefined);
    const { POST } = await import('../../app/api/keywords/competitor-import/route');
    const res = await POST(
      localRequest('/api/keywords/competitor-import', {
        method: 'POST',
        body: JSON.stringify({
          propertyId: 1,
          competitor: 'rival.com',
          csvText: 'Keyword,Volume\nkw,100\n',
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(1);
  });
});
