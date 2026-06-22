import { describe, expect, it, vi, beforeEach } from 'vitest';
import { localRequest, remoteRequest } from '@/server/testHelpers/routeTestUtils';

const fastApiProxyMock = vi.fn();
const fileServiceProxyMock = vi.fn();

vi.mock('@/server/proxyToFastAPI', () => ({
  proxyToFastAPI: (...a: unknown[]) => fastApiProxyMock(...a),
}));
vi.mock('@/server/proxyToFileService', () => ({
  proxyPdfExportToFileService: (...a: unknown[]) => fileServiceProxyMock(...a),
}));

describe('report/export route proxy', () => {
  beforeEach(() => {
    fastApiProxyMock.mockReset();
    fileServiceProxyMock.mockReset();
    vi.resetModules();
    fastApiProxyMock.mockResolvedValue(new Response('csv', { status: 200 }));
    fileServiceProxyMock.mockResolvedValue(
      new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
        status: 200,
        headers: { 'content-type': 'application/pdf' },
      }),
    );
  });

  it('returns 403 for non-local', async () => {
    const { GET } = await import('../../app/api/report/export/route');
    const res = await GET(remoteRequest('/api/report/export?format=csv'));
    expect(res.status).toBe(403);
  });

  it('proxies CSV to FastAPI', async () => {
    const { GET } = await import('../../app/api/report/export/route');
    const req = localRequest('/api/report/export?format=csv&reportId=1');
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(fastApiProxyMock).toHaveBeenCalledWith(req, '/api/report/export');
    expect(fileServiceProxyMock).not.toHaveBeenCalled();
  });

  it('proxies PDF to FileService', async () => {
    const { GET } = await import('../../app/api/report/export/route');
    const req = localRequest('/api/report/export?format=pdf&reportId=1&disposition=inline&profile=premium&branding=true');
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(fileServiceProxyMock).toHaveBeenCalledWith(req);
    expect(fastApiProxyMock).not.toHaveBeenCalled();
  });
});
