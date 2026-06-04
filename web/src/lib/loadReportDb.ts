import type { PoolClient } from 'pg';
import type {
  CrawlRunRow,
  CrawlRunSummary,
  ReportListRow,
  ReportLink,
  ReportPayload,
} from '@/types/report';

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
      'SELECT id, start_url, created_at FROM crawl_runs ORDER BY id DESC',
    );
    return rows.map((row) => ({
      id: Number(row.id),
      start_url: String(row.start_url || ''),
      created_at: row.created_at ? String(row.created_at) : '',
    }));
  } catch {
    return [];
  }
}

export async function getCrawlRunSummaries(client: PoolClient): Promise<CrawlRunSummary[]> {
  try {
    const { rows } = await client.query(
      `SELECT
         cr.id AS crawl_run_id,
         cr.start_url,
         cr.created_at,
         COUNT(crl.id)::int AS url_count,
         COUNT(*) FILTER (WHERE crl.status LIKE '2%')::int AS s2xx,
         COUNT(*) FILTER (WHERE crl.status LIKE '3%')::int AS s3xx,
         COUNT(*) FILTER (WHERE crl.status LIKE '4%')::int AS s4xx,
         COUNT(*) FILTER (WHERE crl.status LIKE '5%')::int AS s5xx,
         COUNT(*) FILTER (
           WHERE crl.status IS NULL
              OR crl.status = ''
              OR crl.status !~ '^[2345]'
         )::int AS other
       FROM crawl_runs cr
       LEFT JOIN crawl_results crl ON crl.crawl_run_id = cr.id
       GROUP BY cr.id, cr.start_url, cr.created_at
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
    }));
  } catch {
    return [];
  }
}

function parseJsonField(val: unknown): Record<string, unknown> {
  if (val == null) return {};
  if (typeof val === 'object' && !Array.isArray(val)) return val as Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(String(val));
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
): Promise<Record<string, unknown> | null> {
  try {
    const { rows } = await client.query(
      'SELECT data FROM google_data ORDER BY id DESC LIMIT 1',
    );
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
): Promise<Record<string, unknown> | null> {
  try {
    const { rows } = await client.query(
      'SELECT data FROM keyword_data ORDER BY id DESC LIMIT 1',
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

export async function mergeSidecarPayloadData(
  client: PoolClient,
  payload: ReportPayload,
): Promise<ReportPayload> {
  const merged: ReportPayload = { ...payload };
  const google = await readLatestGooglePayload(client);
  if (google) merged.google = google;
  const keywords = await readLatestKeywordPayload(client);
  if (keywords) merged.keywords = keywords;
  return merged;
}

export async function readReportPayloadFromDatabase(
  client: PoolClient,
  reportId: number | null = null,
): Promise<ReportPayload> {
  let row;
  if (reportId != null) {
    const res = await client.query('SELECT data FROM report_payload WHERE id = $1', [reportId]);
    row = res.rows[0];
  } else {
    const res = await client.query(
      'SELECT data FROM report_payload ORDER BY id DESC LIMIT 1',
    );
    row = res.rows[0];
  }
  if (!row) {
    throw new Error(reportId != null ? 'Report not found' : 'No report_payload in DB');
  }
  const payload = parseJsonField(row.data) as ReportPayload;
  return mergeSidecarPayloadData(client, payload);
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

// Exported for potential reuse; currently internal-only helper.
export { crawlRunStartUrlsMap };
