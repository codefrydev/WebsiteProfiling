import { NextResponse } from 'next/server';
import { withReportDb } from '@/server/reportSqlite';
import {
  listReportsFromDatabase,
  readReportPayloadFromDatabase,
  getCrawlRunsRows,
} from '@/lib/loadReportDb';
import { computeDomainGroups } from '@/lib/homePortfolio';
import { strings } from '@/lib/strings';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const idsParam = request.nextUrl.searchParams.get('ids');
  const ids = idsParam
    ? idsParam
        .split(',')
        .map((s) => Number(String(s).trim()))
        .filter((n) => Number.isFinite(n) && n > 0)
    : [];

  try {
    const groups = await withReportDb((db) => {
      const all = listReportsFromDatabase(db);
      const idSet = new Set(ids);
      const reportList = ids.length ? all.filter((r) => idSet.has(r.id)) : all;
      const crawlRows = getCrawlRunsRows(db);
      const startUrlByRunId = new Map(crawlRows.map((cr) => [cr.id, cr.start_url]));
      const runCreatedAtByRunId = new Map(crawlRows.map((cr) => [cr.id, cr.created_at]));
      return computeDomainGroups(
        reportList,
        startUrlByRunId,
        runCreatedAtByRunId,
        strings.views.home.unknownBrand,
        strings.common.emDash,
        (id) => readReportPayloadFromDatabase(db, id)
      );
    });
    return NextResponse.json({ groups });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg, groups: [] }, { status: 500 });
  }
}
