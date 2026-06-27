import { crawledUrlCount } from './crawlCounts';
import { DATA_SOURCE_IDS, type DataSourceId } from './dataProvenance';
import { canonicalDomainFromPayload, extractHostname, slugifyDomain } from './domainSlug';
import { titleCoveragePct } from './portfolioCrawlHistory';
import { siteHealthScoreFromPayload } from './siteHealthScore';
import type {
  CrawlRunSummary,
  PortfolioCategorySnapshot,
  PortfolioCrawlConfig,
  PortfolioGroup,
  PortfolioIssueCounts,
  PortfolioSeoSignals,
  ReportListRow,
  ReportPayload,
  StatusCounts,
} from '@/types/report';

const EMPTY_ISSUE_COUNTS: PortfolioIssueCounts = { critical: 0, high: 0, medium: 0, low: 0 };

const PORTFOLIO_CATEGORY_ORDER = [
  'technical_seo',
  'performance',
  'core_web_vitals',
  'link_health',
  'security',
  'html_accessibility',
  'mobile',
  'intelligence',
] as const;

function categorySnapshotsFromPayload(payload: ReportPayload): PortfolioCategorySnapshot[] {
  const cats = payload.categories ?? [];
  const byId = new Map(cats.map((c) => [String(c.id || ''), c]));
  const out: PortfolioCategorySnapshot[] = [];

  const push = (id: string) => {
    const cat = byId.get(id);
    if (!cat || typeof cat.score !== 'number' || !Number.isFinite(cat.score)) return;
    out.push({
      id,
      name: String(cat.name || id),
      score: Math.round(cat.score),
      issueCount: (cat.issues ?? []).length,
    });
  };

  for (const id of PORTFOLIO_CATEGORY_ORDER) push(id);
  for (const cat of cats) {
    const id = String(cat.id || '');
    if (!id || out.some((row) => row.id === id)) continue;
    if (typeof cat.score !== 'number' || !Number.isFinite(cat.score)) continue;
    out.push({
      id,
      name: String(cat.name || id),
      score: Math.round(cat.score),
      issueCount: (cat.issues ?? []).length,
    });
  }
  return out;
}

function seoSignalsFromPayload(payload: ReportPayload): PortfolioSeoSignals | null {
  const s = payload.seo_health;
  if (!s || typeof s !== 'object') return null;
  return {
    missingTitles: Number(s.missing_title) || 0,
    missingMetaDesc: Number(s.missing_meta_desc) || 0,
    thinContent: Number(s.thin_content) || 0,
    h1Issues: (Number(s.h1_zero) || 0) + (Number(s.h1_multi) || 0),
  };
}

function medianWordCountFromPayload(payload: ReportPayload): number | null {
  const median = payload.content_analytics?.word_count_stats?.median;
  return typeof median === 'number' && Number.isFinite(median) ? Math.round(median) : null;
}

function medianResponseMsFromPayload(payload: ReportPayload): number | null {
  const median = payload.response_time_stats?.p50;
  return typeof median === 'number' && Number.isFinite(median) ? Math.round(median) : null;
}

function issueCountsFromPayload(payload: ReportPayload): { counts: PortfolioIssueCounts; total: number } {
  const counts: PortfolioIssueCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const cat of payload.categories ?? []) {
    for (const iss of cat.issues ?? []) {
      const p = String(iss.priority || 'Medium');
      if (p === 'Critical') counts.critical += 1;
      else if (p === 'High') counts.high += 1;
      else if (p === 'Low') counts.low += 1;
      else counts.medium += 1;
    }
  }
  return {
    counts,
    total: counts.critical + counts.high + counts.medium + counts.low,
  };
}

function categoryScoreFromPayload(payload: ReportPayload, id: string): number | null {
  const cat = (payload.categories ?? []).find((c) => c.id === id);
  return typeof cat?.score === 'number' && Number.isFinite(cat.score) ? Math.round(cat.score) : null;
}

function lighthouseScoresFromPayload(payload: ReportPayload): { perf: number | null; seo: number | null } {
  const summary = payload.lighthouse_summary;
  const mm = summary?.median_metrics ?? {};
  const cs = summary?.category_scores ?? {};
  const perfRaw = mm.performance_score ?? cs.performance;
  const seoRaw = mm.seo_score ?? cs.seo;
  const perf = typeof perfRaw === 'number' && Number.isFinite(perfRaw) ? Math.round(perfRaw) : null;
  const seo = typeof seoRaw === 'number' && Number.isFinite(seoRaw) ? Math.round(seoRaw) : null;
  return { perf, seo };
}

function toLocalDateTime(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString();
}

type GetPayloadFn = (reportId: number) => Promise<ReportPayload> | ReportPayload;

export interface PortfolioSummary {
  totalBrands: number;
  totalUrls: number;
  avgHealth: number | null;
}

/** Aggregate stats for the Home stat row. */
export function computePortfolioSummary(groups: PortfolioGroup[]): PortfolioSummary {
  const totalBrands = groups.length;
  const totalUrls = groups.reduce((sum, g) => sum + g.urlCount, 0);
  const avgHealth = totalBrands
    ? Math.round(groups.reduce((sum, g) => sum + g.healthScore, 0) / totalBrands)
    : null;
  return { totalBrands, totalUrls, avgHealth };
}

export type CrawlRunMeta = {
  render_mode?: string;
  discovery_mode?: string;
};

function dataSourcesFromPayload(payload: ReportPayload): DataSourceId[] {
  const raw = payload.report_meta?.data_sources ?? [];
  const allowed = new Set<string>(DATA_SOURCE_IDS);
  return raw.filter((s): s is DataSourceId => allowed.has(String(s)));
}

function crawlConfigFromPayload(
  payload: ReportPayload,
  runMeta?: CrawlRunMeta,
): PortfolioCrawlConfig | null {
  const scope = payload.report_meta?.crawl_scope;
  if (!scope && !runMeta?.render_mode && !runMeta?.discovery_mode) return null;
  return {
    ...scope,
    render_mode: scope?.render_mode ?? runMeta?.render_mode,
    discovery_mode: runMeta?.discovery_mode,
  };
}

function crawlConfigFromSummary(row: CrawlRunSummary): PortfolioCrawlConfig | null {
  if (!row.render_mode && !row.discovery_mode && !row.url_count) return null;
  return {
    pages_crawled: row.url_count,
    render_mode: row.render_mode,
    discovery_mode: row.discovery_mode,
  };
}

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
  runMetaByRunId: Map<number, CrawlRunMeta> = new Map(),
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
    const urlCount = crawledUrlCount(payload);
    const successPct = urlCount > 0 ? Math.round((statusCounts.s2xx / urlCount) * 100) : 0;
    const healthScore = siteHealthScoreFromPayload(payload ?? {}) ?? 0;
    const runCreatedAt = runId != null ? runCreatedAtByRunId.get(runId) : '';
    const lastCrawl = toLocalDateTime(
      runCreatedAt || payload?.crawl_run_created_at || payload?.report_generated_at || r.generated_at,
    );
    const lastAudit = toLocalDateTime(payload?.report_generated_at || r.generated_at);
    const generatedAtMs = Number(new Date(r.generated_at || 0));
    const { counts: issueCounts, total: totalIssues } = issueCountsFromPayload(payload);
    const { perf: perfScore, seo: seoScore } = lighthouseScoresFromPayload(payload);
    const technicalSeoScore = categoryScoreFromPayload(payload, 'technical_seo');
    const successRate =
      typeof summary.success_rate === 'number' && Number.isFinite(summary.success_rate)
        ? Math.round(summary.success_rate)
        : urlCount > 0
          ? successPct
          : null;
    const crawlDurationS =
      typeof summary.crawl_time_s === 'number' && Number.isFinite(summary.crawl_time_s)
        ? Math.round(summary.crawl_time_s)
        : null;
    const categorySnapshots = categorySnapshotsFromPayload(payload);
    const seoSignals = seoSignalsFromPayload(payload);
    const securityFindings = Array.isArray(payload.security_findings) ? payload.security_findings.length : 0;
    const duplicateClusters = Array.isArray(payload.content_duplicates) ? payload.content_duplicates.length : 0;
    const medianWordCount = medianWordCountFromPayload(payload);
    const medianResponseMs = medianResponseMsFromPayload(payload);
    const runMeta = runId != null ? runMetaByRunId.get(runId) : undefined;
    const crawlConfig = crawlConfigFromPayload(payload, runMeta);
    const dataSources = dataSourcesFromPayload(payload);

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
        lastAudit,
        totalIssues,
        issueCounts,
        successRate,
        titleCoverage: null,
        avgWordCount: null,
        thinPages: null,
        technicalSeoScore,
        perfScore,
        seoScore,
        crawlDurationS,
        categorySnapshots,
        seoSignals,
        securityFindings,
        duplicateClusters,
        medianWordCount,
        medianResponseMs,
        reportId: r.id,
        crawlRunId: runId ?? undefined,
        generatedAtMs,
        domainParam: canonicalHost,
        crawlConfig,
        dataSources: dataSources.length > 0 ? dataSources : undefined,
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
      .map((g) => (g.domainParam || extractHostname(g.crawlUrl) || g.domainName).toLowerCase())
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
    const domainKey = domainName.toLowerCase();
    if (!domainKey || coveredDomains.has(domainKey)) continue;

    const statusCounts: StatusCounts = {
      s2xx: Number(row.s2xx) || 0,
      s3xx: Number(row.s3xx) || 0,
      s4xx: Number(row.s4xx) || 0,
      s5xx: Number(row.s5xx) || 0,
      other: Number(row.other) || 0,
    };
    const urlCount = Number(row.url_count) || 0;
    const withTitle = Number(row.with_title) || 0;
    const titleCoverage = titleCoveragePct(withTitle, urlCount);
    const avgWordCount = Math.round(Number(row.avg_word_count) || 0);
    const thinPages = Number(row.thin_pages) || 0;
    const generatedAtMs = Number(new Date(row.created_at || 0));

    const existing = brandMap.get(domainKey);
    if (existing && generatedAtMs <= existing.generatedAtMs) continue;

    brandMap.set(domainKey, {
      domainName,
      crawlUrl: startUrl || emDash,
      urlCount,
      healthScore: titleCoverage,
      statusCounts,
      lastCrawl: toLocalDateTime(row.created_at),
      lastAudit: '',
      totalIssues: 0,
      issueCounts: EMPTY_ISSUE_COUNTS,
      successRate: null,
      titleCoverage,
      avgWordCount,
      thinPages,
      technicalSeoScore: null,
      perfScore: null,
      seoScore: null,
      crawlDurationS: null,
      categorySnapshots: [],
      seoSignals: null,
      securityFindings: 0,
      duplicateClusters: 0,
      medianWordCount: avgWordCount || null,
      medianResponseMs: null,
      reportId: null,
      crawlRunId: row.crawl_run_id,
      crawlOnly: true,
      generatedAtMs,
      domainParam: domainKey,
      crawlConfig: crawlConfigFromSummary(row),
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

export interface BuildPortfolioCardOpts {
  reportId?: number;
  crawlRunId?: number;
}

/**
 * Build a single full portfolio card (full report payload) for the card widget.
 */
export async function buildPortfolioCard(
  reportList: ReportListRow[],
  startUrlByRunId: Map<number, string>,
  runCreatedAtByRunId: Map<number, string>,
  runMetaByRunId: Map<number, CrawlRunMeta>,
  crawlSummaries: CrawlRunSummary[],
  unknownBrand: string,
  emDash: string,
  getPayload: GetPayloadFn,
  opts: BuildPortfolioCardOpts,
): Promise<PortfolioGroup | null> {
  const reportId = opts.reportId;
  const crawlRunId = opts.crawlRunId;

  if (reportId != null && Number.isFinite(reportId)) {
    const row = reportList.find((r) => r.id === reportId);
    if (!row) return null;
    const groups = await computeDomainGroups(
      [row],
      startUrlByRunId,
      runCreatedAtByRunId,
      unknownBrand,
      emDash,
      getPayload,
      runMetaByRunId,
    );
    return groups[0] ?? null;
  }

  if (crawlRunId != null && Number.isFinite(crawlRunId)) {
    const reportGroups = await computeDomainGroups(
      reportList,
      startUrlByRunId,
      runCreatedAtByRunId,
      unknownBrand,
      emDash,
      getPayload,
      runMetaByRunId,
    );
    const fromReport = reportGroups.find((g) => g.crawlRunId === crawlRunId);
    if (fromReport) return fromReport;

    const summary = crawlSummaries.find((s) => Number(s.crawl_run_id) === crawlRunId);
    if (!summary) return null;
    const crawlOnly = computeCrawlOnlyGroups([summary], reportGroups, unknownBrand, emDash);
    return crawlOnly[0] ?? null;
  }

  return null;
}
