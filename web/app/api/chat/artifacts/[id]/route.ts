/**
 * GET /api/chat/artifacts/[id] — retrieve an AI-generated artifact file via FastAPI.
 */
import { type NextRequest } from 'next/server';
import { proxyToFastAPI } from '@/server/proxyToFastAPI';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { requireApiAuthForChat } from '@/server/auth';
import type { ApiRouteHandlerWithParams } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET: ApiRouteHandlerWithParams<{ id: string }> = async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;
  const authDenied = requireApiAuthForChat(request);
  if (authDenied) return authDenied;
  const { id } = await context.params;
  return proxyToFastAPI(request, `/api/chat/artifacts/${id}`);
};
