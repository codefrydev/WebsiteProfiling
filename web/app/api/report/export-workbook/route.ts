import { type NextRequest } from 'next/server';
import { proxyWorkbookExportToFileService } from '@/server/proxyToFileService';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import type { ApiRouteHandler } from '@/types/api';

export const dynamic = 'force-dynamic';

export const GET: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  return proxyWorkbookExportToFileService(request);
};
