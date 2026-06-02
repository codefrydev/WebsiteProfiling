import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { withDb } from '@/server/db';
import type { ApiRouteHandler } from '@/types/api';
import type { KeywordHistoryRow } from '@/types/api';
import type { PoolClient } from 'pg';

export const runtime = 'nodejs';

/**
 * GET /api/integrations/google/keywords/history?keyword=seo+audit&limit=30
 */
export const GET: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const guard = forbiddenIfNotLocal(request);
  if (guard) return guard;

  const { searchParams } = new URL(request.url);
  const keyword = (searchParams.get('keyword') || '').trim();
  const limit = Math.min(parseInt(searchParams.get('limit') || '30', 10), 90);

  if (!keyword) {
    return NextResponse.json({ error: 'keyword parameter is required' }, { status: 400 });
  }

  try {
    return await withDb(async (client: PoolClient) => {
      let rows: KeywordHistoryRow[] = [];
      try {
        const res = await client.query(
          `SELECT fetched_at, position, clicks, impressions, ctr
           FROM keyword_history
           WHERE keyword = $1
           ORDER BY id DESC
           LIMIT $2`,
          [keyword, limit],
        );
        rows = res.rows.reverse() as KeywordHistoryRow[];
      } catch {
        /* table may not exist yet */
      }

      return NextResponse.json({ keyword, history: rows });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};
