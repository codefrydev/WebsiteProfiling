import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { requireApiAuth } from '@/server/auth';
import { listPageMarkdownItems, deletePageMarkdownForRun } from '@/server/pageMarkdownDb';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/page-markdown?crawlRunId=&page=1&limit=25&q=
 * Paginated list of extracted markdown entries for a crawl run.
 */
export const GET: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const params = request.nextUrl.searchParams;
  const crawlRunId = Number(params.get('crawlRunId') || '0');
  if (!crawlRunId) {
    return NextResponse.json({ error: 'crawlRunId required' }, { status: 400 });
  }
  const page = Math.max(1, Number(params.get('page') || '1'));
  const pageSize = Math.min(100, Math.max(1, Number(params.get('limit') || '25')));
  const q = (params.get('q') || '').trim();

  try {
    const result = await listPageMarkdownItems(crawlRunId, page, pageSize, q);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};

/**
 * DELETE /api/page-markdown
 * Body: { crawlRunId: number }
 * Removes extracted markdown for one crawl run (localhost-only).
 */
export const DELETE: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;
  const authDenied = requireApiAuth(request);
  if (authDenied) return authDenied;

  let body: { crawlRunId?: number } = {};
  try {
    body = await request.json();
  } catch {
    /* fall through — no body */
  }

  const crawlRunId = Number(body.crawlRunId ?? 0);
  if (!crawlRunId) {
    return NextResponse.json({ error: 'crawlRunId required' }, { status: 400 });
  }

  try {
    const deletedRows = await deletePageMarkdownForRun(crawlRunId);
    return NextResponse.json({ ok: true, crawlRunId, deletedRows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};
