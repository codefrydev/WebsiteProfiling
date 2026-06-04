import { NextResponse, type NextRequest } from 'next/server';
import { withReportDb } from '@/server/reportDb';
import { readReportPayloadFromDatabase } from '@/lib/loadReportDb';
import type { ApiRouteHandler } from '@/types/api';

export const dynamic = 'force-dynamic';

export const GET: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const raw = request.nextUrl.searchParams.get('reportId');
  const reportId = raw != null && raw !== '' ? Number(raw) : null;
  const domain = request.nextUrl.searchParams.get('domain');
  if (raw != null && raw !== '' && !Number.isFinite(reportId)) {
    return NextResponse.json({ error: 'Invalid reportId' }, { status: 400 });
  }
  try {
    const payload = await withReportDb((db) =>
      readReportPayloadFromDatabase(db, reportId, domain),
    );
    return NextResponse.json({ payload });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg === 'Report not found' ? 404 : msg.includes('not found') ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
};
