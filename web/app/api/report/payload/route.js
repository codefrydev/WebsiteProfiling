import { NextResponse } from 'next/server';
import { withReportDb } from '@/server/reportSqlite';
import { readReportPayloadFromDatabase } from '@/lib/loadReportDb';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const raw = request.nextUrl.searchParams.get('reportId');
  const reportId = raw != null && raw !== '' ? Number(raw) : null;
  if (raw != null && raw !== '' && !Number.isFinite(reportId)) {
    return NextResponse.json({ error: 'Invalid reportId' }, { status: 400 });
  }
  try {
    const payload = await withReportDb((db) => readReportPayloadFromDatabase(db, reportId));
    return NextResponse.json({ payload });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg === 'Report not found' ? 404 : msg.includes('not found') ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
