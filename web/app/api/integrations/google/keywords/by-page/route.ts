import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { withDb } from '@/server/db';
import { parseJsonField } from '@/server/pageGoogleData';
import { resolvePropertyIdFromRequest } from '@/server/resolvePropertyId';
import type { ApiRouteHandler } from '@/types/api';
import type { PoolClient } from 'pg';

export const runtime = 'nodejs';

interface KeywordRow {
  gsc_url?: string;
  [key: string]: unknown;
}

interface CannibalisationEntry {
  pages?: Array<{ url?: string }>;
  [key: string]: unknown;
}

/**
 * GET /api/integrations/google/keywords/by-page?url=...&propertyId=|domain=
 */
export const GET: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const guard = forbiddenIfNotLocal(request);
  if (guard) return guard;

  const { searchParams } = new URL(request.url);
  const pageUrl = (searchParams.get('url') || '').trim();
  const { propertyId, error } = await resolvePropertyIdFromRequest(
    searchParams.get('propertyId'),
    searchParams.get('domain'),
  );

  if (!pageUrl) {
    return NextResponse.json({ error: 'url parameter is required' }, { status: 400 });
  }
  if (error || propertyId == null) {
    return NextResponse.json({ error: error || 'propertyId or domain required' }, { status: 400 });
  }

  try {
    return await withDb(async (client: PoolClient) => {
      const { rows } = await client.query(
        `SELECT data FROM keyword_data
         WHERE property_id = $1
         ORDER BY id DESC LIMIT 1`,
        [propertyId],
      );
      if (!rows.length) {
        return NextResponse.json({ keywords: [], cannibalisation: [] });
      }

      const data = parseJsonField(rows[0].data) || {};
      const allRows = Array.isArray(data.rows) ? (data.rows as KeywordRow[]) : [];

      const normalizedTarget = pageUrl.toLowerCase().replace(/\/$/, '');
      const pageKeywords = allRows.filter((r) => {
        const u = (r.gsc_url || '').toLowerCase().replace(/\/$/, '');
        return u === normalizedTarget || u.includes(normalizedTarget) || normalizedTarget.includes(u);
      });

      const cannibRaw = Array.isArray(data.cannibalisation) ? data.cannibalisation : [];
      const cannib = (cannibRaw as CannibalisationEntry[]).filter((c) =>
        (c.pages || []).some((p) => {
          const u = (p.url || '').toLowerCase().replace(/\/$/, '');
          return u === normalizedTarget;
        }),
      );

      return NextResponse.json({
        url: pageUrl,
        propertyId,
        keyword_count: pageKeywords.length,
        keywords: pageKeywords,
        cannibalisation: cannib,
        fetched_at: data.fetched_at,
      });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};
