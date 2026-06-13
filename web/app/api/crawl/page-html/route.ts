import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { withReportDb } from '@/server/reportDb';
import { deletePageHtmlForRun, listCrawlPageHtmlRuns } from '@/lib/loadReportDb';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DeleteBody = {
  crawlRunId?: number | null;
};

/**
 * GET /api/crawl/page-html?limit=30
 * Lists recent crawl runs with stored HTML stats.
 */
export const GET: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  const limitRaw = Number(request.nextUrl.searchParams.get('limit') || '30');
  const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, limitRaw)) : 30;

  try {
    const runs = await withReportDb((client) => listCrawlPageHtmlRuns(client, { limit }));
    return NextResponse.json({ runs });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg, runs: [] }, { status: 500 });
  }
};

/**
 * DELETE /api/crawl/page-html
 * Body: { crawlRunId: number }
 * Removes raw HTML for one crawl run; crawl results and reports are kept.
 */
export const DELETE: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  let body: DeleteBody = {};
  try {
    body = (await request.json()) as DeleteBody;
  } catch {
    const crawlRunIdRaw = request.nextUrl.searchParams.get('crawlRunId');
    if (crawlRunIdRaw) body.crawlRunId = Number(crawlRunIdRaw);
  }

  const crawlRunId =
    body.crawlRunId != null && Number.isFinite(Number(body.crawlRunId))
      ? Number(body.crawlRunId)
      : null;

  if (crawlRunId == null) {
    return NextResponse.json({ error: 'crawlRunId is required' }, { status: 400 });
  }

  try {
    const deletedPages = await withReportDb((client) => deletePageHtmlForRun(client, crawlRunId));
    if (deletedPages === 0) {
      return NextResponse.json({
        ok: true,
        crawlRunId,
        deletedPages: 0,
        message: 'No stored HTML found for this crawl run.',
      });
    }
    return NextResponse.json({ ok: true, crawlRunId, deletedPages });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};
