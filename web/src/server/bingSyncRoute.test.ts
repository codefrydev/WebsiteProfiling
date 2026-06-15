import { describe, expect, it, vi, beforeEach } from 'vitest';
import { localRequest, makeSpawnChild, makeSpawnError } from '@/server/testHelpers/routeTestUtils';

const spawnMock = vi.fn();
const loadPipelineConfigMock = vi.fn();

vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

vi.mock('@/server/pipelineConfig', () => ({
  loadPipelineConfig: (...args: unknown[]) => loadPipelineConfigMock(...args),
}));

describe('integrations/bing/sync route', () => {
  beforeEach(() => {
    spawnMock.mockReset();
    loadPipelineConfigMock.mockReset();
    vi.resetModules();
  });

  it('returns 400 when credentials missing', async () => {
    loadPipelineConfigMock.mockResolvedValue({ state: { start_url: 'https://example.com' } });
    const { POST } = await import('../../app/api/integrations/bing/sync/route');
    const res = await POST(localRequest('/api/integrations/bing/sync', { method: 'POST' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/bing_webmaster_api_key/i);
  });

  it('returns Bing summary on success', async () => {
    loadPipelineConfigMock.mockResolvedValue({
      state: { bing_webmaster_api_key: 'key', start_url: 'https://example.com' },
    });
    spawnMock.mockImplementation(() =>
      makeSpawnChild(JSON.stringify({ ok: true, linked_page_count: 3 }) + '\n', 0),
    );
    const { POST } = await import('../../app/api/integrations/bing/sync/route');
    const res = await POST(localRequest('/api/integrations/bing/sync', { method: 'POST' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.linked_page_count).toBe(3);
  });

  it('returns 500 (not a hang) when the Python process fails to spawn', async () => {
    loadPipelineConfigMock.mockResolvedValue({
      state: { bing_webmaster_api_key: 'key', start_url: 'https://example.com' },
    });
    spawnMock.mockImplementation(() => makeSpawnError('spawn python3 ENOENT'));
    const { POST } = await import('../../app/api/integrations/bing/sync/route');
    const res = await POST(localRequest('/api/integrations/bing/sync', { method: 'POST' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/ENOENT/);
  });
});
