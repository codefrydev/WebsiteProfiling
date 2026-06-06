import { NextResponse, type NextRequest } from 'next/server';
import { listAuditHistory } from '@/server/auditHistoryDb';
import type { ApiRouteHandler } from '@/types/api';

export const dynamic = 'force-dynamic';

/**
 * GET /api/report/history?propertyId=&domain=&limit=
 */
export const GET: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const sp = request.nextUrl.searchParams;
  const propertyId = Number(sp.get('propertyId') || '0') || null;
  const domain = sp.get('domain')?.trim() || null;
  const limit = Number(sp.get('limit') || '20') || 20;

  try {
    const history = await listAuditHistory(propertyId, domain, limit);
    return NextResponse.json({ history });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg, history: [] }, { status: 500 });
  }
};
