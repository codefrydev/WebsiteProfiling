import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { withDb } from '@/server/db';
import type { ApiRouteHandler } from '@/types/api';
import type { PoolClient } from 'pg';

export const runtime = 'nodejs';

function parseJsonField(val: unknown): Record<string, unknown> | null {
  if (val == null) return null;
  if (typeof val === 'object' && !Array.isArray(val)) return val as Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(String(val));
    if (parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * GET /api/integrations/google/page-data?url=https://example.com/path
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
        'SELECT data FROM google_data ORDER BY id DESC LIMIT 1',
      );
      if (!rows.length) {
        return NextResponse.json({ gsc: null, ga4: null });
      }
      const raw = parseJsonField(rows[0].data);
      const gsc = raw?.gsc as Record<string, unknown> | undefined;
      const ga4 = raw?.ga4 as Record<string, unknown> | undefined;
      const byPage = (gsc?.by_page as Record<string, unknown> | undefined) || {};
      const byPath = (ga4?.by_path as Record<string, unknown> | undefined) || {};

      let urlPath = url;
      try {
        urlPath = new URL(url).pathname;
      } catch { /* keep original url */ }

      return NextResponse.json({
        gsc: byPage[url] ?? null,
        ga4: byPath[urlPath] ?? byPath[url] ?? null,
      });
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};
