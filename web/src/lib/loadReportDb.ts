type PoolClient = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };
import type {
  CrawlPageHtmlRunRow,
  CrawlRunRow,
  CrawlRunSummary,
  CompetitorKeywordGapRow,
  ReportListRow,
  ReportLink,
  ReportPayload,
} from '@/types/report';
import { normalizeDomainQueryParam, domainQueryMatchesRow } from '@/lib/domainSlug';
import { googlePayloadMatchesDomain, stripGoogleIfDomainMismatch } from '@/lib/filterGoogleForDomain';
import { type SectionKey, slicePayloadForSection } from '@/lib/reportSections';

async function crawlRunStartUrlsMap(client: PoolClient): Promise<Map<number, string>> {
  const m = new Map<number, string>();
  try {
    const { rows } = await client.query('SELECT id, start_url FROM crawl_runs');
    for (const row of rows) {
      m.set(Number(row.id), String(row.start_url || ''));
    }
  } catch {
    /* crawl_runs may be missing */
  }
  return m;
}

export async function getCrawlRunsRows(client: PoolClient): Promise<CrawlRunRow[]> {
  try {
    const { rows } = await client.query(
      'SELECT id, start_url, created_at, render_mode, discovery_mode FROM crawl_runs ORDER BY id DESC',
    );
    return rows.map((row) => ({
      id: Number(row.id),
      start_url: String(row.start_url || ''),
      created_at: row.created_at ? String(row.created_at) : '',
      render_mode: row.render_mode != null ? String(row.render_mode) : undefined,
      discovery_mode: row.discovery_mode != null ? String(row.discovery_mode) : undefined,
    }));
  } catch {
    return [];
  }
}

export async function getPageHtmlStatsByRunIds(
  client: PoolClient,
  crawlRunIds: number[],
): Promise<Map<number, { page_count: number; total_bytes: number }>> {
  const stats = new Map<number, { page_count: number; total_bytes: number }>();
  if (!crawlRunIds.length) return stats;
  try {
    const { rows } = await client.query<{
      crawl_run_id: string | number;
      page_count: string | number;
      total_bytes: string | number;
    }>(
      `SELECT crawl_run_id,
              COUNT(*)::int AS page_count,
              COALESCE(SUM(byte_length), 0)::bigint AS total_bytes
       FROM crawl_page_html
       WHERE crawl_run_id = ANY($1::bigint[])
       GROUP BY crawl_run_id`,
      [crawlRunIds],
    );
    for (const row of rows) {
      stats.set(Number(row.crawl_run_id), {
        page_count: Number(row.page_count) || 0,
        total_bytes: Number(row.total_bytes) || 0,
      });
    }
  } catch {
    /* crawl_page_html may be missing */
  }
  return stats;
}

export async function listCrawlPageHtmlRuns(
  client: PoolClient,
  options: { limit?: number } = {},
): Promise<CrawlPageHtmlRunRow[]> {
  const limit = options.limit ?? 30;
  const runs = await getCrawlRunsRows(client);
  const slice = runs.slice(0, Math.max(1, limit));
  const ids = slice.map((r) => r.id);
  const stats = await getPageHtmlStatsByRunIds(client, ids);
  return slice.map((run) => {
    const s = stats.get(run.id);
    return {
      crawl_run_id: run.id,
      start_url: run.start_url,
      created_at: run.created_at,
      render_mode: run.render_mode,
      page_count: s?.page_count ?? 0,
      total_bytes: s?.total_bytes ?? 0,
    };
  });
}

export async function deletePageHtmlForRun(client: PoolClient, crawlRunId: number): Promise<number> {
  try {
    const res = await client.query('DELETE FROM crawl_page_html WHERE crawl_run_id = $1', [crawlRunId]);
    return res.rowCount ?? 0;
  } catch {
    return 0;
  }
}

export async function getCrawlRunSummaries(client: PoolClient): Promise<CrawlRunSummary[]> {
  try {
    const { rows } = await client.query(
      `SELECT
         cr.id AS crawl_run_id,
         cr.start_url,
         cr.created_at,
         cr.render_mode,
         cr.discovery_mode,
         COUNT(crl.id)::int AS url_count,
         COUNT(*) FILTER (WHERE crl.status LIKE '2%')::int AS s2xx,
         COUNT(*) FILTER (WHERE crl.status LIKE '3%')::int AS s3xx,
         COUNT(*) FILTER (WHERE crl.status LIKE '4%')::int AS s4xx,
         COUNT(*) FILTER (WHERE crl.status LIKE '5%')::int AS s5xx,
         COUNT(*) FILTER (
           WHERE crl.status IS NULL
              OR crl.status = ''
              OR crl.status !~ '^[2345]'
         )::int AS other,
         COUNT(*) FILTER (
           WHERE NULLIF(TRIM(COALESCE(crl.title, crl.data->>'title', '')), '') IS NOT NULL
         )::int AS with_title,
         COALESCE(ROUND(AVG(NULLIF((crl.data->>'word_count')::numeric, 0))), 0)::int AS avg_word_count,
         COUNT(*) FILTER (
           WHERE COALESCE((crl.data->>'word_count')::int, 0) > 0
             AND COALESCE((crl.data->>'word_count')::int, 0) < 300
         )::int AS thin_pages
       FROM crawl_runs cr
       LEFT JOIN crawl_results crl ON crl.crawl_run_id = cr.id
       GROUP BY cr.id, cr.start_url, cr.created_at, cr.render_mode, cr.discovery_mode
       ORDER BY cr.id DESC`,
    );
    return rows.map((row) => ({
      crawl_run_id: Number(row.crawl_run_id),
      start_url: String(row.start_url || ''),
      created_at: row.created_at ? String(row.created_at) : '',
      url_count: Number(row.url_count) || 0,
      s2xx: Number(row.s2xx) || 0,
      s3xx: Number(row.s3xx) || 0,
      s4xx: Number(row.s4xx) || 0,
      s5xx: Number(row.s5xx) || 0,
      other: Number(row.other) || 0,
      with_title: Number(row.with_title) || 0,
      avg_word_count: Number(row.avg_word_count) || 0,
      thin_pages: Number(row.thin_pages) || 0,
      render_mode: row.render_mode != null ? String(row.render_mode) : undefined,
      discovery_mode: row.discovery_mode != null ? String(row.discovery_mode) : undefined,
    }));
  } catch {
    return [];
  }
}

function parseJsonField(val: unknown): Record<string, unknown> {
  if (val == null) return {};
  if (typeof val === 'object' && !Array.isArray(val)) {
    return val as Record<string, unknown>;
  }
  if (typeof val !== 'string') return {};
  try {
    const parsed: unknown = JSON.parse(val);
    if (parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

export async function listReportsFromDatabase(client: PoolClient): Promise<ReportListRow[]> {
  try {
    const { rows } = await client.query(
      `SELECT id, generated_at, site_name, canonical_domain
       FROM report_payload ORDER BY id DESC`,
    );
    return rows.map((row) => {
      const siteName = row.site_name != null ? String(row.site_name) : '';
      const canonicalDomain =
        row.canonical_domain != null ? String(row.canonical_domain).toLowerCase() : '';
      return {
        id: Number(row.id),
        generated_at: row.generated_at ? String(row.generated_at) : '',
        site_name: siteName,
        canonical_domain: canonicalDomain,
      };
    });
  } catch {
    return [];
  }
}

/** Latest google_data row, payload-safe (no gsc_full / ga4_full blobs). */
export async function readLatestGooglePayload(
  client: PoolClient,
  propertyId: number | null = null,
): Promise<Record<string, unknown> | null> {
  try {
    const { rows } =
      propertyId != null
        ? await client.query(
            `SELECT data FROM google_data
             WHERE property_id = $1 ORDER BY id DESC LIMIT 1`,
            [propertyId],
          )
        : { rows: [] as { data: unknown }[] };
    if (!rows.length) return null;
    const raw = parseJsonField(rows[0].data);
    if (!raw || typeof raw !== 'object') return null;
    const { gsc_full: _gscFull, ga4_full: _ga4Full, ...payload } = raw;
    return payload;
  } catch {
    return null;
  }
}

export async function readLatestKeywordPayload(
  client: PoolClient,
  propertyId: number | null = null,
): Promise<Record<string, unknown> | null> {
  if (propertyId == null) return null;
  try {
    const { rows } = await client.query(
      `SELECT data FROM keyword_data
       WHERE property_id = $1 ORDER BY id DESC LIMIT 1`,
      [propertyId],
    );
    if (!rows.length) return null;
    const raw = parseJsonField(rows[0].data);
    if (!raw || typeof raw !== 'object') return null;
    const kwRows = Array.isArray(raw.rows) ? raw.rows : [];
    if (kwRows.length > 1000) {
      return { ...raw, rows: kwRows.slice(0, 1000) };
    }
    return raw;
  } catch {
    return null;
  }
}

/** Latest gsc_links_data row (GSC Links CSV import). */
export async function readLatestGscLinksPayload(
  client: PoolClient,
  propertyId: number | null = null,
): Promise<Record<string, unknown> | null> {
  if (propertyId == null) return null;
  try {
    const { rows } = await client.query(
      `SELECT data FROM gsc_links_data
       WHERE property_id = $1 ORDER BY id DESC LIMIT 1`,
      [propertyId],
    );
    if (!rows.length) return null;
    const raw = parseJsonField(rows[0].data);
    if (!raw || typeof raw !== 'object') return null;
    const sample = Array.isArray(raw.sample_links) ? raw.sample_links : [];
    const latest = Array.isArray(raw.latest_links) ? raw.latest_links : [];
    const cap = 2000;
    let out = raw as Record<string, unknown>;
    if (sample.length + latest.length > cap) {
      const sampleCap = Math.min(sample.length, cap);
      const latestCap = Math.max(0, cap - sampleCap);
      out = {
        ...raw,
        sample_links: sample.slice(0, sampleCap),
        latest_links: latest.slice(0, latestCap),
        sample_links_full_count: sample.length,
        latest_links_full_count: latest.length,
      };
    }
    return out;
  } catch {
    return null;
  }
}

/** Per-property competitor keyword gap rows from import UI. */
export async function readCompetitorKeywordGap(
  client: PoolClient,
  propertyId: number | null,
): Promise<CompetitorKeywordGapRow[]> {
  if (propertyId == null) return [];
  try {
    const { rows } = await client.query<{ data: unknown }>(
      'SELECT data FROM competitor_keyword_gap WHERE property_id = $1',
      [propertyId],
    );
    if (!rows.length) return [];
    const raw = parseJsonField(rows[0].data);
    if (!Array.isArray(raw)) return [];
    return raw.filter((r): r is CompetitorKeywordGapRow =>
      r != null && typeof r === 'object' && !Array.isArray(r),
    );
  } catch {
    return [];
  }
}

export async function lookupPropertyIdByDomain(
  client: PoolClient,
  domainRaw: string,
): Promise<number | null> {
  const normalized = normalizeDomainQueryParam(domainRaw);
  if (!normalized) return null;
  const candidates = [
    normalized,
    normalized.startsWith('www.') ? normalized.slice(4) : `www.${normalized}`,
  ];
  try {
    for (const domain of candidates) {
      const { rows } = await client.query<{ id: string }>(
        'SELECT id FROM properties WHERE canonical_domain = $1',
        [domain],
      );
      const id = rows[0]?.id;
      if (id != null) return Number(id);
    }
    return null;
  } catch {
    return null;
  }
}

async function propertyIdForPayload(
  client: PoolClient,
  payload: ReportPayload,
  domainSlug?: string | null,
): Promise<number | null> {
  const fromQuery = domainSlug ? await lookupPropertyIdByDomain(client, domainSlug) : null;
  if (fromQuery != null) return fromQuery;

  const domain = String(
    (payload as ReportPayload & { canonical_domain?: string }).canonical_domain || '',
  )
    .trim()
    .toLowerCase();
  if (!domain) return null;
  return lookupPropertyIdByDomain(client, domain);
}

export async function mergeSidecarPayloadData(
  client: PoolClient,
  payload: ReportPayload,
  domainSlug?: string | null,
): Promise<ReportPayload> {
  let merged: ReportPayload = { ...payload };
  const payloadDomain = (payload as ReportPayload & { canonical_domain?: string }).canonical_domain;
  const scopedDomain =
    domainSlug ?? (payloadDomain != null ? String(payloadDomain) : null);
  const propertyId = await propertyIdForPayload(client, payload, domainSlug);

  const google = await readLatestGooglePayload(client, propertyId);
  if (google) {
    merged.google = google as ReportPayload['google'];
  } else if (scopedDomain && merged.google && !googlePayloadMatchesDomain(merged.google, scopedDomain)) {
    const { google: _drop, ...rest } = merged;
    merged = rest as ReportPayload;
  }

  const keywords = await readLatestKeywordPayload(client, propertyId);
  if (keywords) merged.keywords = keywords as ReportPayload['keywords'];

  const gscLinks = await readLatestGscLinksPayload(client, propertyId);
  if (gscLinks) merged.gsc_links = gscLinks as ReportPayload['gsc_links'];

  const competitorGap = await readCompetitorKeywordGap(client, propertyId);
  if (competitorGap.length > 0) {
    merged.competitor_keyword_gap = competitorGap;
  }

  if (scopedDomain) {
    merged = stripGoogleIfDomainMismatch(merged, scopedDomain);
  }
  return merged;
}

async function resolveReportRow(
  client: PoolClient,
  reportId: number | null,
  domainSlug?: string | null,
): Promise<{ row: { data: unknown }; resolvedReportId: number | null }> {
  let resolvedReportId = reportId;

  if (resolvedReportId == null && domainSlug) {
    const reports = await listReportsFromDatabase(client);
    const normalized = normalizeDomainQueryParam(domainSlug);
    const match = reports.find((r) => domainQueryMatchesRow(r, normalized));
    if (!match) throw new Error('No report for domain');
    resolvedReportId = match.id;
  }

  let row: { data: unknown } | undefined;
  if (resolvedReportId != null) {
    const res = await client.query<{ data: unknown }>(
      'SELECT data FROM report_payload WHERE id = $1',
      [resolvedReportId],
    );
    row = res.rows[0];
  } else {
    const res = await client.query<{ data: unknown }>(
      'SELECT data FROM report_payload ORDER BY id DESC LIMIT 1',
    );
    row = res.rows[0];
  }

  if (!row) {
    throw new Error(
      resolvedReportId != null ? 'Report not found' : 'No report_payload in DB',
    );
  }

  return { row, resolvedReportId };
}

export async function readReportSectionFromDatabase(
  client: PoolClient,
  section: SectionKey,
  reportId: number | null = null,
  domainSlug?: string | null,
): Promise<Partial<ReportPayload>> {
  const { row } = await resolveReportRow(client, reportId, domainSlug);
  const base = parseJsonField(row.data) as ReportPayload;
  const slice = slicePayloadForSection(base, section);

  if (section === 'traffic') {
    const propertyId = await propertyIdForPayload(client, base, domainSlug);
    const google = await readLatestGooglePayload(client, propertyId);
    if (google) {
      if (!domainSlug || googlePayloadMatchesDomain(google as ReportPayload['google'], domainSlug)) {
        slice.google = google as ReportPayload['google'];
      }
    } else if (domainSlug && base.google && !googlePayloadMatchesDomain(base.google, domainSlug)) {
      delete slice.google;
    }
  }

  if (section === 'keywords') {
    const propertyId = await propertyIdForPayload(client, base, domainSlug);
    const keywords = await readLatestKeywordPayload(client, propertyId);
    if (keywords) slice.keywords = keywords as ReportPayload['keywords'];
    const competitorGap = await readCompetitorKeywordGap(client, propertyId);
    if (competitorGap.length > 0) slice.competitor_keyword_gap = competitorGap;
  }

  if (section === 'gsc-links') {
    const propertyId = await propertyIdForPayload(client, base, domainSlug);
    const gscLinks = await readLatestGscLinksPayload(client, propertyId);
    if (gscLinks) slice.gsc_links = gscLinks as ReportPayload['gsc_links'];
  }

  return slice;
}

export async function readReportPayloadFromDatabase(
  client: PoolClient,
  reportId: number | null = null,
  domainSlug?: string | null,
): Promise<ReportPayload> {
  const { row } = await resolveReportRow(client, reportId, domainSlug);
  const payload = parseJsonField(row.data) as ReportPayload;
  return mergeSidecarPayloadData(client, payload, domainSlug);
}

type StatusBucketKey = 's2xx' | 's3xx' | 's4xx' | 's5xx' | 'other';

function statusBucket(status: string): StatusBucketKey {
  const s = String(status || '').trim();
  if (s.startsWith('2')) return 's2xx';
  if (s.startsWith('3')) return 's3xx';
  if (s.startsWith('4')) return 's4xx';
  if (s.startsWith('5')) return 's5xx';
  return 'other';
}

export async function readCrawlPreviewPayload(
  client: PoolClient,
  crawlRunId: number,
): Promise<ReportPayload> {
  const runRes = await client.query(
    'SELECT id, start_url, created_at FROM crawl_runs WHERE id = $1',
    [crawlRunId],
  );
  const runRow = runRes.rows[0];
  if (!runRow) {
    throw new Error('Crawl run not found');
  }

  const startUrl = String(runRow.start_url || '');
  let siteHost = '';
  try {
    siteHost = new URL(startUrl).hostname.toLowerCase();
  } catch {
    siteHost = '';
  }

  const { rows } = await client.query(
    `SELECT url, status, title, data
     FROM crawl_results
     WHERE crawl_run_id = $1
     ORDER BY url`,
    [crawlRunId],
  );

  const inlinkRes = await client.query(
    `SELECT to_url AS url, COUNT(*)::int AS inlinks
     FROM edges
     WHERE crawl_run_id = $1
     GROUP BY to_url`,
    [crawlRunId],
  );
  const inlinksByUrl = new Map<string, number>(
    inlinkRes.rows.map((r) => [String(r.url).replace(/\/$/, ''), Number(r.inlinks) || 0]),
  );

  const statusCounts: Record<StatusBucketKey, number> = {
    s2xx: 0,
    s3xx: 0,
    s4xx: 0,
    s5xx: 0,
    other: 0,
  };
  const links: ReportLink[] = rows.map((row) => {
    const url = String(row.url || '').replace(/\/$/, '');
    const data = parseJsonField(row.data);
    const status = String(row.status || data.status || '');
    statusCounts[statusBucket(status)] += 1;
    const normalized: Record<string, unknown> =
      typeof data === 'object' && data ? { ...data } : {};
    delete normalized.url;
    return {
      ...normalized,
      url,
      status,
      title: String(row.title || data.title || ''),
      inlinks: inlinksByUrl.get(url) || 0,
      outlinks: Number(normalized.outlinks) || 0,
    };
  });

  const total = links.length;
  const successRate = total > 0 ? Math.round((statusCounts.s2xx / total) * 100) : 0;

  return {
    site_name: siteHost || startUrl || 'Site',
    crawl_run_id: crawlRunId,
    crawl_run_created_at: runRow.created_at ? String(runRow.created_at) : '',
    crawl_only_preview: true,
    report_generated_at: runRow.created_at ? String(runRow.created_at) : '',
    links,
    top_pages: links.slice(0, 10).map((l) => ({
      url: l.url,
      title: l.title,
      status: l.status,
      inlinks: l.inlinks,
    })),
    summary: {
      total_urls: total,
      count_2xx: statusCounts.s2xx,
      count_3xx: statusCounts.s3xx,
      count_4xx: statusCounts.s4xx,
      count_5xx: statusCounts.s5xx,
      count_error: statusCounts.other,
      success_rate: successRate,
    },
    categories: [],
  };
}

export interface DeletePortfolioItemOptions {
  reportId?: number | null;
  crawlRunId?: number | null;
}

export interface DeletePortfolioItemResult {
  deletedReport: boolean;
  deletedCrawl: boolean;
}

/** Remove an audit snapshot and/or its crawl run (used from Properties home cards). */
export async function deletePortfolioItem(
  client: PoolClient,
  opts: DeletePortfolioItemOptions,
): Promise<DeletePortfolioItemResult> {
  let deletedReport = false;
  let deletedCrawl = false;
  let crawlId =
    opts.crawlRunId != null && Number.isFinite(Number(opts.crawlRunId))
      ? Number(opts.crawlRunId)
      : null;

  if (opts.reportId != null && Number.isFinite(Number(opts.reportId))) {
    const reportId = Number(opts.reportId);
    const existing = await client.query<{ data: unknown }>(
      'SELECT data FROM report_payload WHERE id = $1',
      [reportId],
    );
    if (existing.rows[0] && crawlId == null) {
      const data = parseJsonField(existing.rows[0].data);
      const fromPayload = data?.crawl_run_id;
      if (fromPayload != null && Number.isFinite(Number(fromPayload))) {
        crawlId = Number(fromPayload);
      }
    }
    const del = await client.query('DELETE FROM report_payload WHERE id = $1', [reportId]);
    deletedReport = (del.rowCount ?? 0) > 0;
  }

  if (crawlId != null) {
    const stillReferenced = await client.query(
      `SELECT 1 FROM report_payload
       WHERE (data->>'crawl_run_id')::bigint = $1
       LIMIT 1`,
      [crawlId],
    );
    if (stillReferenced.rows.length === 0) {
      const delCrawl = await client.query('DELETE FROM crawl_runs WHERE id = $1', [crawlId]);
      deletedCrawl = (delCrawl.rowCount ?? 0) > 0;
    }
  }

  return { deletedReport, deletedCrawl };
}

// Exported for potential reuse; currently internal-only helper.
export { crawlRunStartUrlsMap };
