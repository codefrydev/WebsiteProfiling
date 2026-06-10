import { NextResponse, type NextRequest } from 'next/server';
import { withReportDb } from '@/server/reportDb';
import {
  listReportsFromDatabase,
  readReportPayloadFromDatabase,
  getCrawlRunsRows,
  getCrawlRunSummaries,
} from '@/lib/loadReportDb';
import {
  computeDomainGroups,
  computeCrawlOnlyGroups,
  mergePortfolioGroups,
} from '@/lib/homePortfolio';
import { buildCrawlHistoryByDomain } from '@/lib/portfolioCrawlHistory';
import { strings } from '@/lib/strings';
import type { ApiRouteHandler } from '@/types/api';
import type { StringsCatalog } from '@/types/strings';

export const dynamic = 'force-dynamic';

const catalog = strings as StringsCatalog;

export const GET: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const idsParam = request.nextUrl.searchParams.get('ids');
  const ids = idsParam
    ? idsParam
        .split(',')
        .map((s: string) => Number(String(s).trim()))
        .filter((n: number) => Number.isFinite(n) && n > 0)
    : [];

  try {
    const portfolio = await withReportDb(async (client) => {
      const all = await listReportsFromDatabase(client);
      const idSet = new Set(ids);
      const reportList = ids.length ? all.filter((r) => idSet.has(r.id)) : all;
      const crawlRows = await getCrawlRunsRows(client);
      const startUrlByRunId = new Map(crawlRows.map((cr) => [cr.id, cr.start_url]));
      const runCreatedAtByRunId = new Map(crawlRows.map((cr) => [cr.id, cr.created_at]));
      const runMetaByRunId = new Map(
        crawlRows.map((cr) => [
          cr.id,
          { render_mode: cr.render_mode, discovery_mode: cr.discovery_mode },
        ]),
      );
      const reportGroups = await computeDomainGroups(
        reportList,
        startUrlByRunId,
        runCreatedAtByRunId,
        catalog.views.home.unknownBrand,
        catalog.common.emDash,
        (id: number) => readReportPayloadFromDatabase(client, id),
        runMetaByRunId,
      );
      const crawlSummaries = await getCrawlRunSummaries(client);
      const crawlOnlyGroups = computeCrawlOnlyGroups(
        crawlSummaries,
        reportGroups,
        catalog.views.home.unknownBrand,
        catalog.common.emDash,
      );
      const groups = mergePortfolioGroups(reportGroups, crawlOnlyGroups);
      const crawlHistoryByDomain = buildCrawlHistoryByDomain(crawlSummaries);
      return { groups, crawlHistoryByDomain };
    });
    return NextResponse.json(portfolio);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg, groups: [], crawlHistoryByDomain: {} }, { status: 500 });
  }
};
