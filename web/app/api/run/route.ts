/**
 * POST /api/run — enqueue a pipeline job via FastAPI.
 * FastAPI validates config, saves it, and enqueues to the Python worker.
 */
import { type NextRequest } from 'next/server';
import { proxyToFastAPI } from '@/server/proxyToFastAPI';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import { requireApiAuth } from '@/server/auth';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';

export const POST: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;
  const authDenied = requireApiAuth(request);
  if (authDenied) return authDenied;
  return proxyToFastAPI(request, '/api/run');
};
