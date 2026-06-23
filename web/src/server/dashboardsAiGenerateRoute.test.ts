import { describe, expect, it, vi, beforeEach } from 'vitest';
import { localRequest, remoteRequest } from '@/server/testHelpers/routeTestUtils';

const fetchMock = vi.fn();

vi.stubGlobal('fetch', fetchMock);

describe('POST /api/dashboards/ai-generate', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.resetModules();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, widget: { title: 'Test', viz: 'kpi' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  it('returns 403 for non-local host', async () => {
    const { POST } = await import('../../app/api/dashboards/ai-generate/route');
    const res = await POST(
      remoteRequest('/api/dashboards/ai-generate', {
        method: 'POST',
        body: JSON.stringify({ mode: 'widget', prompt: 'show health' }),
      }),
    );
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 400 when prompt is missing', async () => {
    const { POST } = await import('../../app/api/dashboards/ai-generate/route');
    const res = await POST(
      localRequest('/api/dashboards/ai-generate', {
        method: 'POST',
        body: JSON.stringify({ mode: 'widget' }),
      }),
    );
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards catalog payload to FastAPI', async () => {
    const { POST } = await import('../../app/api/dashboards/ai-generate/route');
    const res = await POST(
      localRequest('/api/dashboards/ai-generate', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'widget',
          prompt: 'show health score',
          toolName: 'get_category_scores',
          propertyId: 1,
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/dashboards/ai-generate');
    const sent = JSON.parse(String(init.body));
    expect(sent.mode).toBe('widget');
    expect(sent.prompt).toBe('show health score');
    expect(Array.isArray(sent.catalog)).toBe(true);
    expect(sent.catalog.length).toBeGreaterThan(0);
    expect(sent.viz_types).toBeTruthy();
    expect(sent.dashscript_help).toContain('DashScript');
  });
});
