import { NextResponse, type NextRequest } from 'next/server';
import { getCrawlPreviewPayload } from '@/server/reportDb';
import type { ApiRouteHandler } from '@/types/api';

export const dynamic = 'force-dynamic';

export const GET: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const raw = request.nextUrl.searchParams.get('crawlRunId');
  const crawlRunId = raw != null && raw !== '' ? Number(raw) : null;
  if (crawlRunId == null || !Number.isFinite(crawlRunId) || crawlRunId <= 0) {
    return NextResponse.json({ error: 'Invalid crawlRunId' }, { status: 400 });
  }
  try {
    const payload = await getCrawlPreviewPayload(crawlRunId);
    return NextResponse.json({ payload });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg === 'Crawl run not found' ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
};
