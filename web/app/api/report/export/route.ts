import { type NextRequest } from 'next/server';
import { proxyToFastAPI } from '@/server/proxyToFastAPI';
import { proxyPdfExportToFileService } from '@/server/proxyToFileService';
import { forbiddenIfNotLocal } from '@/server/localOnly';
import type { ApiRouteHandler } from '@/types/api';

export const dynamic = 'force-dynamic';

export const GET: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const denied = forbiddenIfNotLocal(request);
  if (denied) return denied;

  const format = request.nextUrl.searchParams.get('format') ?? 'csv';
  if (format === 'pdf') {
    return proxyPdfExportToFileService(request);
  }

  return proxyToFastAPI(request, '/api/report/export');
};
