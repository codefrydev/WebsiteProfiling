import { NextResponse, type NextRequest } from 'next/server';
import { listPageMarkdownRuns } from '@/server/pageMarkdownDb';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/page-markdown/runs?propertyId=
 * Returns crawl runs with html_page_count and markdown_page_count for a property.
 */
export const GET: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const propertyId = Number(request.nextUrl.searchParams.get('propertyId') || '0') || null;
  try {
    const runs = await listPageMarkdownRuns(propertyId);
    return NextResponse.json({ runs });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg, runs: [] }, { status: 500 });
  }
};
