import { NextResponse } from 'next/server';
import { withDb } from '@/server/db';
import type { ApiRouteHandler } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET: ApiRouteHandler = async (): Promise<Response> => {
  try {
    await withDb(async (client) => {
      await client.query('SELECT 1');
    });
    return NextResponse.json({ ok: true, database: 'up' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, database: 'down', error: msg }, { status: 503 });
  }
};
