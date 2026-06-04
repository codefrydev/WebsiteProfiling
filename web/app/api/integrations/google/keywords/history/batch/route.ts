import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { withDb } from '@/server/db';
import { resolvePropertyIdFromRequest } from '@/server/resolvePropertyId';
import type { ApiRouteHandler, KeywordHistoryBatchBody, KeywordHistoryRow } from '@/types/api';
import type { PoolClient } from 'pg';

export const runtime = 'nodejs';

const MAX_KEYWORDS = 100;
const MAX_LIMIT_PER_KEYWORD = 90;

/**
 * POST /api/integrations/google/keywords/history/batch
 * Body: { keywords: string[], limit?: number, propertyId?: number, domain?: string }
 */
export const POST: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const guard = forbiddenIfNotLocal(request);
  if (guard) return guard;

  let body: KeywordHistoryBatchBody & { propertyId?: number; domain?: string };
  try {
    body = (await request.json()) as KeywordHistoryBatchBody & {
      propertyId?: number;
      domain?: string;
    };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { propertyId, error } = await resolvePropertyIdFromRequest(
    body.propertyId != null ? String(body.propertyId) : null,
    body.domain ?? null,
  );
  if (error || propertyId == null) {
    return NextResponse.json({ error: error || 'propertyId or domain required' }, { status: 400 });
  }

  const rawKeywords: unknown[] = Array.isArray(body?.keywords) ? body.keywords : [];
  const keywords = Array.from(
    new Set(
      rawKeywords
        .map((k) => String(k || '').trim())
        .filter((k): k is string => Boolean(k)),
    ),
  ).slice(0, MAX_KEYWORDS);
  const limit = Math.min(
    Math.max(parseInt(String(body.limit ?? '30'), 10) || 30, 1),
    MAX_LIMIT_PER_KEYWORD,
  );

  if (!keywords.length) {
    return NextResponse.json({ histories: {}, propertyId });
  }

  try {
    return await withDb(async (client: PoolClient) => {
      const histories: Record<string, KeywordHistoryRow[]> = Object.fromEntries(
        keywords.map((k) => [k, []]),
      );

      try {
        const res = await client.query(
          `SELECT keyword, fetched_at, position, clicks, impressions, ctr
           FROM keyword_history
           WHERE property_id = $1 AND keyword = ANY($2::text[])
           ORDER BY keyword, id DESC`,
          [propertyId, keywords],
        );

        const buckets: Record<string, KeywordHistoryRow[]> = Object.fromEntries(
          keywords.map((k) => [k, []]),
        );
        for (const row of res.rows) {
          const kw = String(row.keyword ?? '');
          if (!buckets[kw]) continue;
          if (buckets[kw].length >= limit) continue;
          buckets[kw].push({
            fetched_at: row.fetched_at != null ? String(row.fetched_at) : null,
            position: row.position != null ? Number(row.position) : null,
            clicks: row.clicks != null ? Number(row.clicks) : null,
            impressions: row.impressions != null ? Number(row.impressions) : null,
            ctr: row.ctr != null ? Number(row.ctr) : null,
          });
        }

        for (const kw of keywords) {
          histories[kw] = (buckets[kw] || []).reverse();
        }
      } catch {
        /* keyword_history table may not exist yet */
      }

      return NextResponse.json({ histories, propertyId });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};
