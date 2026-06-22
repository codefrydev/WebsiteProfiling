import { type NextRequest } from 'next/server';
import { proxyToFastAPI } from '@/server/proxyToFastAPI';
import type { ApiRouteHandler } from '@/types/api';

export const dynamic = 'force-dynamic';

export const POST: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  return proxyToFastAPI(request, '/api/keywords/content-brief');
};
