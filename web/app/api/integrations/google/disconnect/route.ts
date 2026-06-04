import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { writeSecrets, getPublicStatus } from '@/server/googleSecrets';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';

/**
 * POST /api/integrations/google/disconnect
 * Clears tokens (refreshToken, serviceAccount) but keeps property IDs.
 */
export const POST: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  try {
    writeSecrets({ refreshToken: null, serviceAccount: null, authMode: null });
    return NextResponse.json({ ok: true, status: getPublicStatus() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};
