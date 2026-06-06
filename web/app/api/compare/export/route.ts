import { NextResponse, type NextRequest } from 'next/server';
import { withDb } from '@/server/db';
import type { ApiRouteHandler } from '@/types/api';
import type { ReportCategory, ReportIssue } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function issueKey(cat: string, iss: ReportIssue): string {
  return `${cat}|${iss.url || ''}|${iss.message || ''}`;
}

function collectIssues(categories: ReportCategory[] = []): Map<string, { cat: string; issue: ReportIssue }> {
  const map = new Map<string, { cat: string; issue: ReportIssue }>();
  for (const cat of categories) {
    const name = cat.name || cat.id || '';
    for (const issue of cat.issues || []) {
      map.set(issueKey(name, issue), { cat: name, issue });
    }
  }
  return map;
}

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
          const cur = await client.query<{ data: { categories?: ReportCategory[] } }>(
            'SELECT data FROM report_payload WHERE id = $1',
            [id],
          );
          return cur.rows[0]?.data || { categories: [] };
        }),
      );
      return rows;
    });

    const issuesA = collectIssues(payloadA.categories);
    const issuesB = collectIssues(payloadB.categories);
    const lines = ['change,category,priority,url,message,recommendation'];

    for (const [key, { cat, issue }] of issuesA) {
      if (!issuesB.has(key)) {
        lines.push(
          [
            'removed',
            cat,
            issue.priority || '',
            issue.url || '',
            issue.message || '',
            issue.recommendation || '',
          ]
            .map((v) => csvEscape(String(v)))
            .join(','),
        );
      }
    }
    for (const [key, { cat, issue }] of issuesB) {
      if (!issuesA.has(key)) {
        lines.push(
          [
            'added',
            cat,
            issue.priority || '',
            issue.url || '',
            issue.message || '',
            issue.recommendation || '',
          ]
            .map((v) => csvEscape(String(v)))
            .join(','),
        );
      }
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
