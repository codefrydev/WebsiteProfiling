import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import {
  getGoogleAppPublicStatus,
  saveGoogleAppSettings,
} from '@/server/googleAppSettings';
import type { ApiRouteHandler, GoogleCredentialsPostBody } from '@/types/api';

export const runtime = 'nodejs';

const PROPERTY_ONLY_MSG =
  'Per-site settings (GSC, GA4, refresh token) must be saved via property Integrations when a Site URL is set.';

/** POST /api/integrations/google/credentials — save OAuth app Client ID/Secret to database. */
export const POST: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;
  try {
    const body = (await request.json().catch(() => ({}))) as GoogleCredentialsPostBody;

    if (
      'refreshToken' in body ||
      'gscSiteUrl' in body ||
      'ga4PropertyId' in body
    ) {
      return NextResponse.json({ error: PROPERTY_ONLY_MSG }, { status: 400 });
    }

    const patch: Parameters<typeof saveGoogleAppSettings>[0] = {};
    if (typeof body.clientId === 'string' && body.clientId.trim()) {
      patch.clientId = body.clientId.trim();
    }
    if (typeof body.clientSecret === 'string' && body.clientSecret.trim()) {
      patch.clientSecret = body.clientSecret.trim();
    }
    if (typeof body.dateRangeDays === 'number' && body.dateRangeDays > 0) {
      patch.dateRangeDays = body.dateRangeDays;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 });
    }

    await saveGoogleAppSettings(patch);
    const status = await getGoogleAppPublicStatus();
    return NextResponse.json({ ok: true, status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};
