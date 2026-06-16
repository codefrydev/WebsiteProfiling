import { describe, expect, it, vi, beforeEach } from 'vitest';
import { localRequest, remoteRequest, makeSpawnChild } from '@/server/testHelpers/routeTestUtils';

const composeMock = vi.fn();
const exportMock = vi.fn();

vi.mock('@/server/spawnCustomReport', () => ({
  composeCustomReport: (...args: unknown[]) => composeMock(...args),
  exportCustomReportArtifact: (...args: unknown[]) => exportMock(...args),
}));

describe('report/custom routes', () => {
  beforeEach(() => {
    composeMock.mockReset();
    exportMock.mockReset();
    vi.resetModules();
  });

  it('compose returns 403 for non-local', async () => {
    const { POST } = await import('../../app/api/report/custom/compose/route');
    const res = await POST(
      remoteRequest('/api/report/custom/compose', {
        method: 'POST',
        body: JSON.stringify({ title: 'T', propertyId: 1, sections: [{ type: 'notes', markdown: 'x' }] }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it('compose validates payload', async () => {
    const { POST } = await import('../../app/api/report/custom/compose/route');
    const res = await POST(
      localRequest('/api/report/custom/compose', {
        method: 'POST',
        body: JSON.stringify({ title: 'T' }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('compose returns spec id', async () => {
    composeMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: { report_spec_id: 'abc-123' },
    });
    const { POST } = await import('../../app/api/report/custom/compose/route');
    const res = await POST(
      localRequest('/api/report/custom/compose', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Client report',
          propertyId: 2,
          sections: [{ type: 'executive_summary' }],
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.report_spec_id).toBe('abc-123');
  });

  it('export returns file bytes', async () => {
    exportMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        filename: 'client.html',
        mime_type: 'text/html',
        data_b64: Buffer.from('<html></html>').toString('base64'),
      },
    });
    const { GET } = await import('../../app/api/report/custom/export/route');
    const res = await GET(
      localRequest('/api/report/custom/export?specId=abc&format=html&propertyId=1'),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/html');
    const text = await res.text();
    expect(text).toContain('<html>');
  });
});
