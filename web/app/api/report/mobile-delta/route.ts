import { NextResponse, type NextRequest } from 'next/server';
import { getMobileDesktopDelta } from '@/server/mobileDeltaDb';
import type { ApiRouteHandler } from '@/types/api';

export const dynamic = 'force-dynamic';

/**
 * GET /api/report/mobile-delta?id=<run_id>
 */
export const GET: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const id = Number(request.nextUrl.searchParams.get('id') || '0');
  if (!id) return NextResponse.json({ error: 'id required', deltas: [] }, { status: 400 });

  try {
    const deltas = await getMobileDesktopDelta(id);
    return NextResponse.json({ deltas });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg, deltas: [] }, { status: 500 });
  }
};
