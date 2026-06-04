import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { getPropertyGooglePublicStatus, getPropertyById } from '@/server/propertiesDb';
import { getGoogleAppPublicStatus } from '@/server/googleAppSettings';
import { withDb } from '@/server/db';
import type { ApiRouteHandlerWithParams } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET: ApiRouteHandlerWithParams<{ id: string }> = async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;
  const { id } = await params;
  const propertyId = parseInt(id, 10);
  if (!Number.isFinite(propertyId)) {
    return NextResponse.json({ error: 'Invalid property id' }, { status: 400 });
  }
  try {
    const row = await getPropertyById(propertyId);
    if (!row) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 });
    }
    const propStatus = await getPropertyGooglePublicStatus(propertyId);
    const globalStatus = await getGoogleAppPublicStatus();
    const status = {
      ...propStatus,
      hasClientId: globalStatus.hasClientId,
      gscSiteUrl: propStatus.gscSiteUrl,
      ga4PropertyId: propStatus.ga4PropertyId,
      dateRangeDays: propStatus.dateRangeDays,
      connected: propStatus.connected,
      authMode: propStatus.authMode,
    };
    let lastFetchedAt: string | null = null;
    await withDb(async (client) => {
      const cur = await client.query<{ fetched_at: string }>(
        `SELECT fetched_at::text FROM google_data
         WHERE property_id = $1 ORDER BY id DESC LIMIT 1`,
        [propertyId],
      );
      lastFetchedAt = cur.rows[0]?.fetched_at ?? null;
    });
    return NextResponse.json({ ...status, lastFetchedAt, propertyId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};
