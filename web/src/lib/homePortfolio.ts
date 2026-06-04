import { canonicalDomainFromPayload, extractHostname, slugifyDomain } from './domainSlug';
import type {
  CrawlRunSummary,
  PortfolioGroup,
  ReportListRow,
  ReportPayload,
  StatusCounts,
} from '@/types/report';

function scoreFromCategories(categories: Array<{ score?: number }> = []): number | null {
  const numeric = (categories || [])
    .map((c) => Number(c?.score))
    .filter((n) => Number.isFinite(n));
  if (!numeric.length) return null;
  const avg = numeric.reduce((a, b) => a + b, 0) / numeric.length;
  return Math.round(avg);
}

function toLocalDateTime(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString();
}

type GetPayloadFn = (reportId: number) => Promise<ReportPayload> | ReportPayload;

/**
 * Build portfolio domain cards (same logic as Home view useMemo).
 */
export async function computeDomainGroups(
  reportList: ReportListRow[],
  startUrlByRunId: Map<number, string>,
  runCreatedAtByRunId: Map<number, string>,
  unknownBrand: string,
  emDash: string,
  getPayload: GetPayloadFn,
): Promise<PortfolioGroup[]> {
  const brandMap = new Map<string, PortfolioGroup>();

  for (const r of reportList) {
    let payload: ReportPayload;
    try {
      payload = await getPayload(r.id);
    } catch {
      continue;
    }

    const runId = payload?.crawl_run_id != null ? Number(payload.crawl_run_id) : null;
    const runStartUrl = runId != null ? startUrlByRunId.get(runId) || '' : '';
    const fallbackUrl = String(payload?.top_pages?.[0]?.url || payload?.links?.[0]?.url || '');
    const crawlUrl = (runStartUrl || fallbackUrl || '').trim();
    const startDomain = extractHostname(runStartUrl);
    const fallbackDomain = extractHostname(crawlUrl);
    const domainName = startDomain || fallbackDomain || String(payload?.site_name || unknownBrand);
    const brandKey = startDomain || (fallbackDomain ? `fallback:${fallbackDomain}` : `report:${r.id}`);

    const summary = payload?.summary || {};
    const statusCounts: StatusCounts = {
      s2xx: Number(summary.count_2xx || 0),
      s3xx: Number(summary.count_3xx || 0),
      s4xx: Number(summary.count_4xx || 0),
      s5xx: Number(summary.count_5xx || 0),
      other: Number(summary.count_error || 0),
    };
    const urlCount = Number(summary.total_urls || payload?.links?.length || payload?.top_pages?.length || 0);
    const successPct = urlCount > 0 ? Math.round((statusCounts.s2xx / urlCount) * 100) : 0;
    const globalHealthBase = scoreFromCategories(payload?.categories) ?? Number(summary.success_rate || 0);
    const healthScore = Math.round(globalHealthBase * 0.6 + successPct * 0.4);
    const runCreatedAt = runId != null ? runCreatedAtByRunId.get(runId) : '';
    const lastCrawl = toLocalDateTime(
      runCreatedAt || payload?.crawl_run_created_at || payload?.report_generated_at || r.generated_at,
    );
    const generatedAtMs = Number(new Date(r.generated_at || 0));

    const existing = brandMap.get(brandKey);
    if (!existing || generatedAtMs > existing.generatedAtMs) {
      const canonicalHost =
        canonicalDomainFromPayload(payload, startUrlByRunId) || slugifyDomain(String(payload?.site_name || ''));
      brandMap.set(brandKey, {
        domainName,
        crawlUrl: crawlUrl || emDash,
        urlCount,
        healthScore,
        statusCounts,
        lastCrawl,
        reportId: r.id,
        crawlRunId: runId ?? undefined,
        generatedAtMs,
        domainParam: canonicalHost,
      });
    }
  }

  return Array.from(brandMap.values()).sort((a, b) => b.generatedAtMs - a.generatedAtMs);
}

/**
 * Build home cards for crawl runs that do not yet have a report_payload snapshot.
 */
export function computeCrawlOnlyGroups(
  crawlSummaries: CrawlRunSummary[],
  reportGroups: PortfolioGroup[],
  unknownBrand: string,
  emDash: string,
): PortfolioGroup[] {
  const coveredDomains = new Set(
    reportGroups
      .map((g) => (g.domainParam || slugifyDomain(g.domainName || '')).toLowerCase())
      .filter(Boolean),
  );
  const coveredCrawlRunIds = new Set(
    reportGroups
      .map((g) => g.crawlRunId)
      .filter((id): id is number => id != null && Number.isFinite(id)),
  );

  const brandMap = new Map<string, PortfolioGroup>();

  for (const row of crawlSummaries) {
    const crawlRunId = Number(row.crawl_run_id);
    if (Number.isFinite(crawlRunId) && coveredCrawlRunIds.has(crawlRunId)) continue;

    const startUrl = String(row.start_url || '').trim();
    const domainName = extractHostname(startUrl) || unknownBrand;
    const domainKey = slugifyDomain(domainName).toLowerCase();
    if (!domainKey || coveredDomains.has(domainKey)) continue;

    const statusCounts: StatusCounts = {
      s2xx: Number(row.s2xx) || 0,
      s3xx: Number(row.s3xx) || 0,
      s4xx: Number(row.s4xx) || 0,
      s5xx: Number(row.s5xx) || 0,
      other: Number(row.other) || 0,
    };
    const urlCount = Number(row.url_count) || 0;
    const successPct = urlCount > 0 ? Math.round((statusCounts.s2xx / urlCount) * 100) : 0;
    const generatedAtMs = Number(new Date(row.created_at || 0));

    const existing = brandMap.get(domainKey);
    if (existing && generatedAtMs <= existing.generatedAtMs) continue;

    brandMap.set(domainKey, {
      domainName,
      crawlUrl: startUrl || emDash,
      urlCount,
      healthScore: successPct,
      statusCounts,
      lastCrawl: toLocalDateTime(row.created_at),
      reportId: null,
      crawlRunId: row.crawl_run_id,
      crawlOnly: true,
      generatedAtMs,
      domainParam: domainKey,
    });
  }

  return Array.from(brandMap.values());
}

/** Merge report-based portfolio cards with crawl-only cards (PostgreSQL). */
export function mergePortfolioGroups(
  reportGroups: PortfolioGroup[],
  crawlOnlyGroups: PortfolioGroup[],
): PortfolioGroup[] {
  return [...reportGroups, ...crawlOnlyGroups].sort((a, b) => b.generatedAtMs - a.generatedAtMs);
}
