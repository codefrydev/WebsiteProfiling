import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { exportCustomReportArtifact } from '@/server/spawnCustomReport';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  const params = request.nextUrl.searchParams;
  const reportSpecId = String(params.get('specId') || '').trim();
  const format = (params.get('format') || 'html').toLowerCase();
  const propertyId = Number(params.get('propertyId') || '0');
  const reportIdRaw = params.get('reportId');
  const reportId = reportIdRaw && /^\d+$/.test(reportIdRaw) ? Number(reportIdRaw) : null;

  if (!reportSpecId || !propertyId) {
    return NextResponse.json({ error: 'specId and propertyId required' }, { status: 400 });
  }
  if (format !== 'html' && format !== 'pdf') {
    return NextResponse.json({ error: 'format must be html or pdf' }, { status: 400 });
  }

  const result = await exportCustomReportArtifact({
    reportSpecId,
    format,
    propertyId,
    reportId,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error, ...result.data }, { status: result.status });
  }

  const filename = String(result.data.filename || `custom-report.${format}`);
  const mimeType = String(result.data.mime_type || (format === 'pdf' ? 'application/pdf' : 'text/html'));
  const b64 = String(result.data.data_b64 || '');
  const buf = Buffer.from(b64, 'base64');
  const dispositionParam = params.get('disposition');
  const inline = dispositionParam === 'inline';

  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': mimeType,
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${filename}"`,
    },
  });
};
