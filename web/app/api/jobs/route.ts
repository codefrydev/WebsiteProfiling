/**
 * GET /api/jobs — list recent pipeline jobs via FastAPI.
 */
import { type NextRequest } from 'next/server';
import { proxyToFastAPI } from '@/server/proxyToFastAPI';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;
  return proxyToFastAPI(request, '/api/jobs');
};
