import { NextResponse } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { writeSecrets, getPublicStatus } from '@/server/googleSecrets';

export const runtime = 'nodejs';

/**
 * POST /api/integrations/google/disconnect
 * Clears tokens (refreshToken, serviceAccount) but keeps property IDs.
 */
export async function POST(request) {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  try {
    writeSecrets({ refreshToken: null, serviceAccount: null, authMode: null });
    return NextResponse.json({ ok: true, status: getPublicStatus() });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
