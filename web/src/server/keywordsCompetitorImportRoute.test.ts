import { describe, expect, it, vi, beforeEach } from 'vitest';
import { localRequest } from '@/server/testHelpers/routeTestUtils';

const spawnMock = vi.fn();

vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

describe('keywords/competitor-import route', () => {
  beforeEach(() => {
    spawnMock.mockReset();
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

  it('imports competitor keywords on success via property-scoped store', async () => {
    spawnMock.mockImplementation(() => ({
      stdout: {
        on: (_: string, cb: (c: Buffer) => void) =>
          cb(
            Buffer.from(
              JSON.stringify({
                count: 1,
                rows: [{ keyword: 'kw', competitor: 'rival.com' }],
                mergedCount: 1,
                mergedRows: [{ keyword: 'kw', competitor: 'rival.com' }],
              }),
            ),
          ),
      },
      stderr: { on: () => undefined },
      stdin: { write: () => undefined, end: () => undefined },
      on: (event: string, cb: (code: number) => void) => { if (event === 'close') cb(0); },
    }));
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
    expect(body.mergedCount).toBe(1);
    expect(spawnMock).toHaveBeenCalled();
    const script = String(spawnMock.mock.calls[0]?.[1]?.[1] ?? '');
    expect(script).toContain('merge_competitor_keyword_import');
  });

  it('returns 500 when python fails', async () => {
    spawnMock.mockImplementation(() => ({
      stdout: { on: () => undefined },
      stderr: { on: (_: string, cb: (c: Buffer) => void) => cb(Buffer.from('db error')) },
      stdin: { write: () => undefined, end: () => undefined },
      on: (event: string, cb: (code: number) => void) => { if (event === 'close') cb(1); },
    }));
    const { POST } = await import('../../app/api/keywords/competitor-import/route');
    const res = await POST(
      localRequest('/api/keywords/competitor-import', {
        method: 'POST',
        body: JSON.stringify({
          propertyId: 2,
          competitor: 'rival.com',
          csvText: 'Keyword,Volume\nkw,100\n',
        }),
      }),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('failed');
  });
});
