import { NextResponse } from 'next/server';
import { getReportMeta } from '@/server/reportSqlite';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getReportMeta();
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
