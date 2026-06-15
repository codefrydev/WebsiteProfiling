import { describe, expect, it, vi, beforeEach } from 'vitest';
import { localRequest } from '@/server/testHelpers/routeTestUtils';

const spawnMock = vi.fn();
vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

describe('report/export-sitemap route', () => {
  beforeEach(() => {
    spawnMock.mockReset();
    vi.resetModules();
  });

  it('returns xml on success', async () => {
    spawnMock.mockImplementation(() => ({
      stdout: { on: (_: string, cb: (c: Buffer) => void) => cb(Buffer.from('<urlset></urlset>')) },
      stderr: { on: () => undefined },
      on: (event: string, cb: (code: number) => void) => { if (event === 'close') cb(0); },
    }));
    const { GET } = await import('../../app/api/report/export-sitemap/route');
    const res = await GET(localRequest('/api/report/export-sitemap?reportId=12'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/xml');
    const text = await res.text();
    expect(text).toContain('urlset');
  });

  it('returns 500 when python fails', async () => {
    spawnMock.mockImplementation(() => ({
      stdout: { on: () => undefined },
      stderr: { on: (_: string, cb: (c: Buffer) => void) => cb(Buffer.from('boom')) },
      on: (event: string, cb: (code: number) => void) => { if (event === 'close') cb(1); },
    }));
    const { GET } = await import('../../app/api/report/export-sitemap/route');
    const res = await GET(localRequest('/api/report/export-sitemap?reportId=12'));
    expect(res.status).toBe(500);
  });
});
