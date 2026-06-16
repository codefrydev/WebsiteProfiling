import { NextResponse, type NextRequest } from 'next/server';
import { withReportDb } from '@/server/reportDb';
import {
  listReportsFromDatabase,
  readReportPayloadFromDatabase,
  readReportSectionFromDatabase,
  getCrawlRunsRows,
  getCrawlRunSummaries,
} from '@/lib/loadReportDb';
import {
  computeDomainGroups,
  computeCrawlOnlyGroups,
  computePortfolioSummary,
  mergePortfolioGroups,
  buildPortfolioCard,
} from '@/lib/homePortfolio';
import { buildCrawlHistoryByDomain } from '@/lib/portfolioCrawlHistory';
import { strings } from '@/lib/strings';
import type { ApiRouteHandler } from '@/types/api';
import type { StringsCatalog } from '@/types/strings';
import type { PoolClient } from 'pg';

export const dynamic = 'force-dynamic';

const catalog = strings as StringsCatalog;

const WIDGETS = ['full', 'groups', 'card', 'summary'] as const;
type PortfolioWidget = (typeof WIDGETS)[number];

async function loadPortfolioMaps(client: PoolClient) {
  const crawlRows = await getCrawlRunsRows(client);
  const startUrlByRunId = new Map(crawlRows.map((cr) => [cr.id, cr.start_url]));
  const runCreatedAtByRunId = new Map(crawlRows.map((cr) => [cr.id, cr.created_at]));
  const runMetaByRunId = new Map(
    crawlRows.map((cr) => [
      cr.id,
      { render_mode: cr.render_mode, discovery_mode: cr.discovery_mode },
    ]),
  );
  const crawlSummaries = await getCrawlRunSummaries(client);
  return { startUrlByRunId, runCreatedAtByRunId, runMetaByRunId, crawlSummaries };
}

async function buildGroupsBundle(
  client: PoolClient,
  reportList: Awaited<ReturnType<typeof listReportsFromDatabase>>,
  lite: boolean,
) {
  const { startUrlByRunId, runCreatedAtByRunId, runMetaByRunId, crawlSummaries } =
    await loadPortfolioMaps(client);
  const unknownBrand = catalog.views.home.unknownBrand;
  const emDash = catalog.common.emDash;
  const getPayload = lite
    ? (id: number) => readReportSectionFromDatabase(client, 'core', id)
    : (id: number) => readReportPayloadFromDatabase(client, id);

  const reportGroups = await computeDomainGroups(
    reportList,
    startUrlByRunId,
    runCreatedAtByRunId,
    unknownBrand,
    emDash,
    getPayload,
    runMetaByRunId,
  );
  const crawlOnlyGroups = computeCrawlOnlyGroups(
    crawlSummaries,
    reportGroups,
    unknownBrand,
    emDash,
  );
  const groups = mergePortfolioGroups(reportGroups, crawlOnlyGroups);
  const crawlHistoryByDomain = buildCrawlHistoryByDomain(crawlSummaries);
  return { groups, crawlHistoryByDomain, crawlSummaries, startUrlByRunId, runCreatedAtByRunId, runMetaByRunId };
}

export const GET: ApiRouteHandler = async (request: NextRequest): Promise<Response> => {
  const idsParam = request.nextUrl.searchParams.get('ids');
  const ids = idsParam
    ? idsParam
        .split(',')
        .map((s: string) => Number(String(s).trim()))
        .filter((n: number) => Number.isFinite(n) && n > 0)
    : [];

  const widgetParam = request.nextUrl.searchParams.get('widget') || 'full';
  if (!WIDGETS.includes(widgetParam as PortfolioWidget)) {
    return NextResponse.json({ error: 'Invalid widget' }, { status: 400 });
  }
  const widget = widgetParam as PortfolioWidget;

  const reportIdParam = request.nextUrl.searchParams.get('reportId');
  const crawlRunIdParam = request.nextUrl.searchParams.get('crawlRunId');
  const reportId =
    reportIdParam != null && reportIdParam !== '' ? Number(reportIdParam) : undefined;
  const crawlRunId =
    crawlRunIdParam != null && crawlRunIdParam !== '' ? Number(crawlRunIdParam) : undefined;

  if (widget === 'card' && reportId == null && crawlRunId == null) {
    return NextResponse.json({ error: 'reportId or crawlRunId required for card widget' }, { status: 400 });
  }

  try {
    const result = await withReportDb(async (client) => {
      const all = await listReportsFromDatabase(client);
      const idSet = new Set(ids);
      const reportList = ids.length ? all.filter((r) => idSet.has(r.id)) : all;

      if (widget === 'card') {
        const maps = await loadPortfolioMaps(client);
        const group = await buildPortfolioCard(
          reportList,
          maps.startUrlByRunId,
          maps.runCreatedAtByRunId,
          maps.runMetaByRunId,
          maps.crawlSummaries,
          catalog.views.home.unknownBrand,
          catalog.common.emDash,
          (id: number) => readReportPayloadFromDatabase(client, id),
          { reportId, crawlRunId },
        );
        if (!group) return { group: null };
        return { group };
      }

      const lite = widget === 'groups' || widget === 'summary';
      const bundle = await buildGroupsBundle(client, reportList, lite);

      if (widget === 'summary') {
        return { ...computePortfolioSummary(bundle.groups) };
      }

      return { groups: bundle.groups, crawlHistoryByDomain: bundle.crawlHistoryByDomain };
    });

    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg, groups: [], crawlHistoryByDomain: {} }, { status: 500 });
  }
};
