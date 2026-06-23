/**
 * Proxy file export requests to the FileService (.NET) backend.
 */
import type { NextRequest } from 'next/server';

const FILE_SERVICE_BASE = (process.env.FILE_SERVICE_URL ?? 'http://127.0.0.1:8080').replace(/\/$/, '');

async function proxyFileServiceGet(req: NextRequest, path: string, defaultContentType: string): Promise<Response> {
  const url = `${FILE_SERVICE_BASE}${path}`;

  let upstream: Response;
  try {
    upstream = await fetch(url, { method: 'GET' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'File service unreachable';
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    });
  }

  const contentType = upstream.headers.get('content-type') ?? defaultContentType;
  const contentDisposition = upstream.headers.get('content-disposition');

  const headers: Record<string, string> = { 'content-type': contentType };
  if (contentDisposition) {
    headers['content-disposition'] = contentDisposition;
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}

export async function proxyPdfExportToFileService(req: NextRequest): Promise<Response> {
  const reportId = req.nextUrl.searchParams.get('reportId');
  const domain = req.nextUrl.searchParams.get('domain');
  const profile = req.nextUrl.searchParams.get('profile') ?? 'standard';
  const disposition = req.nextUrl.searchParams.get('disposition') ?? 'attachment';
  const branding = req.nextUrl.searchParams.get('branding') ?? 'true';

  const qs = new URLSearchParams({ profile, disposition, branding });
  let path: string;
  if (reportId) {
    path = `/v1/reports/${encodeURIComponent(reportId)}/pdf?${qs.toString()}`;
  } else if (domain) {
    path = `/v1/reports/by-domain/${encodeURIComponent(domain)}/pdf?${qs.toString()}`;
  } else {
    return new Response(JSON.stringify({ error: 'reportId or domain required for PDF export' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  return proxyFileServiceGet(req, path, 'application/pdf');
}

export async function proxyWorkbookExportToFileService(req: NextRequest): Promise<Response> {
  const reportId = req.nextUrl.searchParams.get('reportId');
  const domain = req.nextUrl.searchParams.get('domain');
  const disposition = req.nextUrl.searchParams.get('disposition') ?? 'attachment';

  const qs = new URLSearchParams({ disposition });
  let path: string;
  if (reportId) {
    path = `/v1/reports/${encodeURIComponent(reportId)}/workbook?${qs.toString()}`;
  } else if (domain) {
    path = `/v1/reports/by-domain/${encodeURIComponent(domain)}/workbook?${qs.toString()}`;
  } else {
    return new Response(JSON.stringify({ error: 'reportId or domain required for workbook export' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  return proxyFileServiceGet(
    req,
    path,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
}
