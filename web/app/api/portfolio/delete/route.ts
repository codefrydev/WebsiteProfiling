import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { withReportDb } from '@/server/reportDb';
import { deletePortfolioItem } from '@/lib/loadReportDb';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DeleteBody = {
  reportId?: number | null;
  crawlRunId?: number | null;
};

export const DELETE: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  let body: DeleteBody = {};
  try {
    body = (await request.json()) as DeleteBody;
  } catch {
    const reportIdRaw = request.nextUrl.searchParams.get('reportId');
    const crawlRunIdRaw = request.nextUrl.searchParams.get('crawlRunId');
    if (reportIdRaw) body.reportId = Number(reportIdRaw);
    if (crawlRunIdRaw) body.crawlRunId = Number(crawlRunIdRaw);
  }

  const reportId =
    body.reportId != null && Number.isFinite(Number(body.reportId)) ? Number(body.reportId) : null;
  const crawlRunId =
    body.crawlRunId != null && Number.isFinite(Number(body.crawlRunId))
      ? Number(body.crawlRunId)
      : null;

  if (reportId == null && crawlRunId == null) {
    return NextResponse.json({ error: 'reportId or crawlRunId is required' }, { status: 400 });
  }

  try {
    const result = await withReportDb((client) =>
      deletePortfolioItem(client, { reportId, crawlRunId }),
    );
    if (!result.deletedReport && !result.deletedCrawl) {
      return NextResponse.json({ error: 'Nothing was deleted (not found or crawl still in use)' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};
