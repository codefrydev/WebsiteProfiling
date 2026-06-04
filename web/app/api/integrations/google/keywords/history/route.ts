import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { withDb } from '@/server/db';
import { resolvePropertyIdFromRequest } from '@/server/resolvePropertyId';
import type { ApiRouteHandler } from '@/types/api';
import type { KeywordHistoryRow } from '@/types/api';
import type { PoolClient } from 'pg';

export const runtime = 'nodejs';

/**
 * GET /api/integrations/google/keywords/history?keyword=...&propertyId=|domain=
 */
export const GET: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const guard = forbiddenIfNotLocal(request);
  if (guard) return guard;

  const { searchParams } = new URL(request.url);
  const keyword = (searchParams.get('keyword') || '').trim();
  const limit = Math.min(parseInt(searchParams.get('limit') || '30', 10), 90);
  const { propertyId, error } = await resolvePropertyIdFromRequest(
    searchParams.get('propertyId'),
    searchParams.get('domain'),
  );

  if (!keyword) {
    return NextResponse.json({ error: 'keyword parameter is required' }, { status: 400 });
  }
  if (error || propertyId == null) {
    return NextResponse.json({ error: error || 'propertyId or domain required' }, { status: 400 });
  }

  try {
    return await withDb(async (client: PoolClient) => {
      let rows: KeywordHistoryRow[] = [];
      try {
        const res = await client.query(
          `SELECT fetched_at, position, clicks, impressions, ctr
           FROM keyword_history
           WHERE property_id = $1 AND keyword = $2
           ORDER BY id DESC
           LIMIT $3`,
          [propertyId, keyword, limit],
        );
        rows = res.rows.reverse() as KeywordHistoryRow[];
      } catch {
        /* table may not exist yet */
      }

      return NextResponse.json({ keyword, propertyId, history: rows });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};
