import { NextResponse } from 'next/server';
import { getReportMeta } from '@/server/reportDb';
import type { ApiRouteHandler } from '@/types/api';

export const dynamic = 'force-dynamic';

export const GET: ApiRouteHandler = async (): Promise<Response> => {
  try {
    const data = await getReportMeta();
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};
