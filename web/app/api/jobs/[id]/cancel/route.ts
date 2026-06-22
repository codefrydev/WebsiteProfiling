/**
 * POST /api/jobs/[id]/cancel — cancel a pipeline job via FastAPI.
 */
import { type NextRequest } from 'next/server';
import { proxyToFastAPI } from '@/server/proxyToFastAPI';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { requireApiAuth } from '@/server/auth';
import type { ApiRouteHandlerWithParams } from '@/types/api';

export const runtime = 'nodejs';

export const POST: ApiRouteHandlerWithParams<{ id: string }> = async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;
  const authDenied = requireApiAuth(request);
  if (authDenied) return authDenied;
  const { id } = await params;
  return proxyToFastAPI(request, `/api/jobs/${id}/cancel`);
};
