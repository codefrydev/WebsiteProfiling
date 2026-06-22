/**
 * GET /api/chat/sessions/[id]/messages — get chat session messages via FastAPI.
 */
import { type NextRequest } from 'next/server';
import { proxyToFastAPI } from '@/server/proxyToFastAPI';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { requireApiAuthForChat } from '@/server/auth';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET: ApiRouteHandler = async (
  request: NextRequest,
  context?: { params?: Promise<{ id: string }> },
): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;
  const authDenied = requireApiAuthForChat(request);
  if (authDenied) return authDenied;
  const params = context?.params ? await context.params : { id: '' };
  return proxyToFastAPI(request, `/api/chat/sessions/${params.id}/messages`);
};
