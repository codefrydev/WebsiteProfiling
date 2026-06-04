import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { withDb } from '@/server/db';
import { historySummary, parseJsonField, sliceFromGoogleRow } from '@/server/pageGoogleData';
import type { ApiRouteHandler } from '@/types/api';
import type { PoolClient } from 'pg';

export const runtime = 'nodejs';

/**
 * GET /api/integrations/google/page-data/history?url=...
 * Lists site-wide google_data rows that have metrics for this page.
 */
export const GET: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  const url = request.nextUrl.searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'url parameter required' }, { status: 400 });
  }

  try {
    return await withDb(async (client: PoolClient) => {
      const { rows } = await client.query(
        'SELECT id, fetched_at, data FROM google_data ORDER BY id DESC LIMIT 10',
      );
      const history: Array<{
        id: number;
        fetchedAt: string | null;
        type: 'snapshot';
        gsc: { clicks?: number; impressions?: number; position?: number } | null;
        ga4: { sessions?: number; engagementRate?: number } | null;
      }> = [];

      for (const row of rows) {
        const raw = parseJsonField(row.data);
        if (!raw) continue;
        const slice = sliceFromGoogleRow(raw, url);
        if (!slice.gsc && !slice.ga4) continue;
        history.push({
          id: Number(row.id),
          fetchedAt: row.fetched_at ? String(row.fetched_at) : null,
          type: 'snapshot',
          ...historySummary(slice.gsc, slice.ga4),
        });
      }

      return NextResponse.json({ url, history });
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};
