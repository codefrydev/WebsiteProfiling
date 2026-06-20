import { NextResponse, type NextRequest } from 'next/server';
import { getPageMarkdownContent } from '@/server/pageMarkdownDb';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/page-markdown/content?crawlRunId=&url=
 * Returns the full markdown body for one URL.
 */
export const GET: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const params = request.nextUrl.searchParams;
  const crawlRunId = Number(params.get('crawlRunId') || '0');
  const url = (params.get('url') || '').trim();

  if (!crawlRunId) {
    return NextResponse.json({ error: 'crawlRunId required' }, { status: 400 });
  }
  if (!url) {
    return NextResponse.json({ error: 'url required' }, { status: 400 });
  }

  try {
    const content = await getPageMarkdownContent(crawlRunId, url);
    if (!content) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ content });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};
