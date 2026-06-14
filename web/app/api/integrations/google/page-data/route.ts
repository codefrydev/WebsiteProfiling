import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { withDb } from '@/server/db';
import { loadGoogleDataRow, resolvePropertyIdForPageGoogle, sliceFromGoogleRow } from '@/server/pageGoogleData';
import type { ApiRouteHandler } from '@/types/api';
import type { PoolClient } from 'pg';

export const runtime = 'nodejs';

/**
 * GET /api/integrations/google/page-data?url=...&googleSnapshotId=...
 */
export const GET: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  const url = request.nextUrl.searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'url parameter required' }, { status: 400 });
  }

  const snapParam = request.nextUrl.searchParams.get('googleSnapshotId');
  const googleSnapshotId = snapParam ? parseInt(snapParam, 10) : null;

  try {
    return await withDb(async (client: PoolClient) => {
      const propertyId = await resolvePropertyIdForPageGoogle(
        client,
        url,
        request.nextUrl.searchParams.get('propertyId'),
        request.nextUrl.searchParams.get('domain'),
      );
      const row = await loadGoogleDataRow(
        client,
        googleSnapshotId != null && Number.isFinite(googleSnapshotId) ? googleSnapshotId : null,
        propertyId,
      );
      if (!row) {
        return NextResponse.json({
          source: 'snapshot',
          snapshotId: null,
          gsc: null,
          ga4: null,
          coverage: { inCrawl: false, inGsc: false, inGa4: false },
          siteBenchmarks: { gsc: null, ga4: null },
          dateRange: {},
          fetchedAt: null,
        });
      }

      const slice = sliceFromGoogleRow(row.raw, url);
      return NextResponse.json({
        ...slice,
        snapshotId: row.id,
        fetchedAt: row.fetchedAt ?? slice.fetchedAt,
      });
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};
