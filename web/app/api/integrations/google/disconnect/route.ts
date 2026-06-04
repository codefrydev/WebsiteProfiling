import { NextResponse, type NextRequest } from 'next/server';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { getGoogleAppPublicStatus } from '@/server/googleAppSettings';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';

/** Global disconnect is deprecated — use per-property disconnect. */
export const POST: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  const status = await getGoogleAppPublicStatus();
  return NextResponse.json({
    ok: false,
    error:
      'Disconnect Google per site: set Site URL, open Integrations, and use Disconnect on that property.',
    status,
  });
};
