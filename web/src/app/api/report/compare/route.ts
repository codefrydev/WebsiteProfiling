import { NextResponse, type NextRequest } from 'next/server';
import { buildReportCompareResponse } from '@/server/reportCompareServer';
import type { ApiRouteHandler } from '@/types/api';

export const dynamic = 'force-dynamic';

export const GET: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const reportIdRaw = request.nextUrl.searchParams.get('reportId');
  const baselineIdRaw = request.nextUrl.searchParams.get('baselineId');

  const reportId = reportIdRaw != null && reportIdRaw !== '' ? Number(reportIdRaw) : NaN;
  const baselineId = baselineIdRaw != null && baselineIdRaw !== '' ? Number(baselineIdRaw) : NaN;

  if (!Number.isFinite(reportId) || !Number.isFinite(baselineId)) {
    return NextResponse.json(
      { error: 'reportId and baselineId query parameters are required' },
      { status: 400 },
    );
  }

  try {
    const body = await buildReportCompareResponse(reportId, baselineId);
    return NextResponse.json(body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg === 'Report not found' ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
};
