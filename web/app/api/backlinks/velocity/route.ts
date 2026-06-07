import { NextResponse, type NextRequest } from 'next/server';
import { withDb } from '@/server/db';
import type { ApiRouteHandler } from '@/types/api';

export const dynamic = 'force-dynamic';

/**
 * GET /api/backlinks/velocity?propertyId=
 */
export const GET: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const propertyId = Number(request.nextUrl.searchParams.get('propertyId') || '0');
  if (!propertyId) {
    return NextResponse.json({ error: 'propertyId required' }, { status: 400 });
  }

  try {
    const snapshots = await withDb(async (client) => {
      const cur = await client.query<{
        captured_at: Date;
        referring_domains: number;
        top_domains: unknown;
      }>(
        `SELECT captured_at, referring_domains, top_domains
         FROM gsc_links_snapshots
         WHERE property_id = $1
         ORDER BY captured_at ASC
         LIMIT 52`,
        [propertyId],
      );
      return cur.rows.map((row) => ({
        capturedAt: row.captured_at.toISOString(),
        referringDomains: row.referring_domains,
        topDomains: row.top_domains,
      }));
    });
    return NextResponse.json({ snapshots });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg, snapshots: [] }, { status: 500 });
  }
};
