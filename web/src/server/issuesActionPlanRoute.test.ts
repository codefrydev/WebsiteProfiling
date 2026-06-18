import { describe, expect, it, vi, beforeEach } from 'vitest';
import { localRequest } from '@/server/testHelpers/routeTestUtils';
import { makeSpawnChild } from '@/server/testHelpers/routeTestUtils';

const spawnMock = vi.fn();
vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

describe('issues/action-plan route', () => {
  beforeEach(() => {
    spawnMock.mockReset();
    vi.resetModules();
  });

  it('returns 400 when domain missing', async () => {
    const { POST } = await import('../../app/api/issues/action-plan/route');
    const res = await POST(
      localRequest('/api/issues/action-plan', {
        method: 'POST',
        body: JSON.stringify({ issues: [{ message: 'Missing title' }] }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when issues missing', async () => {
    const { POST } = await import('../../app/api/issues/action-plan/route');
    const res = await POST(
      localRequest('/api/issues/action-plan', {
        method: 'POST',
        body: JSON.stringify({ domain: 'example.com' }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns plan when Python succeeds', async () => {
    spawnMock.mockImplementation(() =>
      makeSpawnChild(
        JSON.stringify({
          ok: true,
          plan: 'Fix critical issues first.',
          summary: 'Start with titles.',
        }) + '\n',
        0,
      ),
    );
    const { POST } = await import('../../app/api/issues/action-plan/route');
    const res = await POST(
      localRequest('/api/issues/action-plan', {
        method: 'POST',
        body: JSON.stringify({
          domain: 'example.com',
          issues: [{ message: 'Missing title', category: 'Technical SEO', priority: 'High' }],
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.plan).toMatch(/critical/i);
  });
});
