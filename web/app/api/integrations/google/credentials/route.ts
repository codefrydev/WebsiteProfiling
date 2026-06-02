import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { writeSecrets, getPublicStatus } from '@/server/googleSecrets';
import type { ApiRouteHandler, GoogleCredentialsPostBody, GoogleSecrets } from '@/types/api';

export const runtime = 'nodejs';

/** POST /api/integrations/google/credentials
 *  Body: { clientId?, clientSecret?, refreshToken?, gscSiteUrl?, ga4PropertyId?, dateRangeDays? }
 *  Merges into existing .secrets/google.json (atomic write).
 */
export const POST: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;
  try {
    const body = (await request.json().catch(() => ({}))) as GoogleCredentialsPostBody;
    const patch: Partial<GoogleSecrets> = {};

    if (typeof body.clientId === 'string' && body.clientId.trim()) {
      patch.clientId = body.clientId.trim();
    }
    if (typeof body.clientSecret === 'string' && body.clientSecret.trim()) {
      patch.clientSecret = body.clientSecret.trim();
    }
    if (typeof body.refreshToken === 'string') {
      patch.refreshToken = body.refreshToken.trim() || null;
      if (patch.refreshToken) patch.authMode = 'oauth';
    }
    if (typeof body.gscSiteUrl === 'string') {
      patch.gscSiteUrl = body.gscSiteUrl.trim() || null;
    }
    if (typeof body.ga4PropertyId === 'string') {
      const v = body.ga4PropertyId.trim();
      if (v && !/^\d+$/.test(v)) {
        return NextResponse.json(
          {
            error:
              'Analytics property ID must be a numeric ID (e.g. 123456789). The G-XXXXXXX code is a Measurement ID — find the numeric ID in GA4 Admin > Property Settings.',
          },
          { status: 400 },
        );
      }
      patch.ga4PropertyId = v || null;
    }
    if (typeof body.dateRangeDays === 'number' && body.dateRangeDays > 0) {
      patch.dateRangeDays = body.dateRangeDays;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 });
    }

    writeSecrets(patch);
    return NextResponse.json({ ok: true, status: getPublicStatus() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};
