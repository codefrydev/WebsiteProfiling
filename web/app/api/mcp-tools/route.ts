import { type NextRequest, NextResponse } from 'next/server';
import { proxyToFastAPI } from '@/server/proxyToFastAPI';
import { forbiddenIfNotLocal } from '@/server/localOnly';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse | Response> {
  const guard = forbiddenIfNotLocal(request);
  if (guard) return guard;
  return proxyToFastAPI(request, '/api/mcp-tools');
}
