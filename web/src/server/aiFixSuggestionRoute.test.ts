import { describe, expect, it, vi, beforeEach } from 'vitest';
import { localRequest } from '@/server/testHelpers/routeTestUtils';
import { makeSpawnChild } from '@/server/testHelpers/routeTestUtils';

const spawnMock = vi.fn();
vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

describe('ai/fix-suggestion route', () => {
  beforeEach(() => {
    spawnMock.mockReset();
    vi.resetModules();
  });

  it('returns 400 when message missing', async () => {
    const { POST } = await import('../../app/api/ai/fix-suggestion/route');
    const res = await POST(
      localRequest('/api/ai/fix-suggestion', {
        method: 'POST',
        body: JSON.stringify({ source: 'lighthouse' }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns suggestion when Python succeeds', async () => {
    spawnMock.mockImplementation(() =>
      makeSpawnChild(
        JSON.stringify({ ok: true, fix: { fix: 'Add preload hint', effort: 'low' } }) + '\n',
        0,
      ),
    );
    const { POST } = await import('../../app/api/ai/fix-suggestion/route');
    const res = await POST(
      localRequest('/api/ai/fix-suggestion', {
        method: 'POST',
        body: JSON.stringify({
          source: 'lighthouse',
          message: 'Slow LCP',
          url: 'https://example.com/',
          context: { kind: 'audit', id: 'lcp' },
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.fix.fix).toMatch(/preload/i);
  });
});
