import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { withDb } from '@/server/db';
import { normalizeUrl } from '@/lib/urlNorm';
import { historySummary, parseJsonField, publicGa4Page, publicGscPage } from '@/server/pageGoogleData';
import type { ApiRouteHandler } from '@/types/api';
import type { PoolClient } from 'pg';

export const runtime = 'nodejs';

/**
 * GET /api/integrations/google/page-live/history?url=...
 */
export const GET: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  const url = request.nextUrl.searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'url parameter required' }, { status: 400 });
  }

  const urlNorm = normalizeUrl(url);

  try {
    return await withDb(async (client: PoolClient) => {
      const { rows } = await client.query(
        `
        SELECT id, fetched_at, data
        FROM page_google_snapshots
        WHERE url_norm = $1
        ORDER BY fetched_at DESC, id DESC
        LIMIT 15
        `,
        [urlNorm],
      );

      const history = rows.map((row) => {
        const data = parseJsonField(row.data);
        const gsc = data?.gsc && typeof data.gsc === 'object' ? publicGscPage(data.gsc as Record<string, unknown>) : null;
        const ga4 = data?.ga4 && typeof data.ga4 === 'object' ? publicGa4Page(data.ga4 as Record<string, unknown>) : null;
        return {
          id: Number(row.id),
          fetchedAt: row.fetched_at ? String(row.fetched_at) : null,
          type: 'live' as const,
          ...historySummary(gsc, ga4),
        };
      });

      return NextResponse.json({ url, history });
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};
