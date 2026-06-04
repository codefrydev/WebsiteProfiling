import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import {
  getPropertyById,
  getPropertyGooglePublicStatus,
  setPropertyGoogleCredentials,
} from '@/server/propertiesDb';
import type { ApiRouteHandlerWithParams, GoogleCredentialsPostBody } from '@/types/api';

export const runtime = 'nodejs';

export const POST: ApiRouteHandlerWithParams<{ id: string }> = async (
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
    const body = (await request.json().catch(() => ({}))) as GoogleCredentialsPostBody;
    const patch: Parameters<typeof setPropertyGoogleCredentials>[1] = {};

    if ('gscSiteUrl' in body) {
      patch.gscSiteUrl =
        typeof body.gscSiteUrl === 'string' && body.gscSiteUrl.trim()
          ? body.gscSiteUrl.trim()
          : null;
    }
    if ('ga4PropertyId' in body) {
      const v = typeof body.ga4PropertyId === 'string' ? body.ga4PropertyId.trim() : '';
      if (v && !/^\d+$/.test(v)) {
        return NextResponse.json(
          {
            error:
              'Analytics property ID must be a numeric ID (e.g. 123456789). The G-XXXXXXX code is a Measurement ID.',
          },
          { status: 400 },
        );
      }
      patch.ga4PropertyId = v || null;
    }
    if (typeof body.dateRangeDays === 'number' && body.dateRangeDays > 0) {
      patch.dateRangeDays = body.dateRangeDays;
    }
    if (typeof body.refreshToken === 'string' && body.refreshToken.trim()) {
      patch.refreshToken = body.refreshToken.trim();
      patch.authMode = 'oauth';
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 });
    }

    await setPropertyGoogleCredentials(propertyId, patch);
    const status = await getPropertyGooglePublicStatus(propertyId);
    return NextResponse.json({ ok: true, status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};
