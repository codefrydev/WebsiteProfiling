import { NextResponse, type NextRequest } from 'next/server';
import { withDb } from '@/server/db';
import { buildIssueDeltas } from '@/lib/reportCompareExtras';
import type { ApiRouteHandler } from '@/types/api';
import type { ReportCategory, ReportPayload } from '@/types/report';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/**
 * POST /api/compare/export — CSV diff between two report ids.
 */
export const POST: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  let body: { reportIdA?: number; reportIdB?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const reportIdA = Number(body.reportIdA || 0);
  const reportIdB = Number(body.reportIdB || 0);
  if (!reportIdA || !reportIdB) {
    return NextResponse.json({ error: 'reportIdA and reportIdB required' }, { status: 400 });
  }

  try {
    const [payloadA, payloadB] = await withDb(async (client) => {
      const rows = await Promise.all(
        [reportIdA, reportIdB].map(async (id) => {
          const cur = await client.query<{ data: ReportPayload }>(
            'SELECT data FROM report_payload WHERE id = $1',
            [id],
          );
          return cur.rows[0]?.data ?? { categories: [] as ReportCategory[] };
        }),
      );
      return rows;
    });

    const deltas = buildIssueDeltas(payloadA, payloadB);
    const lines = ['change,category,priority,url,message,recommendation'];

    for (const row of deltas) {
      const change = row.kind === 'new' ? 'added' : 'removed';
      lines.push(
        [change, row.category, row.priority, row.url, row.message, '']
          .map((v) => csvEscape(String(v)))
          .join(','),
      );
    }

    const csv = `${lines.join('\n')}\n`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="audit-compare-${reportIdA}-vs-${reportIdB}.csv"`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};
