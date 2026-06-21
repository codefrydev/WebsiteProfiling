/**
 * Shared helpers: slice per-page metrics from google_data JSON blobs.
 */
import type { PoolClient } from 'pg';
import { normalizeUrl, urlToPath } from '@/lib/urlNorm';

export interface PageGscSlice {
  page?: string;
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
  queries?: Array<{
    query?: string;
    clicks?: number;
    impressions?: number;
    ctr?: number;
    position?: number;
  }>;
}

export interface PageGa4Slice {
  path?: string;
  full_url?: string;
  sessions?: number;
  activeUsers?: number;
  screenPageViews?: number;
  engagementRate?: number;
  avgSessionDuration?: number;
}

export function parseJsonField(val: unknown): Record<string, unknown> | null {
  if (val == null) return null;
  if (typeof val === 'object' && !Array.isArray(val)) return val as Record<string, unknown>;
  if (typeof val !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(val);
    if (parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function gscFullBlob(raw: Record<string, unknown>): Record<string, unknown> {
  const full = raw.gsc_full;
  if (full && typeof full === 'object') return full as Record<string, unknown>;
  const gsc = raw.gsc;
  return gsc && typeof gsc === 'object' ? (gsc as Record<string, unknown>) : {};
}

function ga4FullBlob(raw: Record<string, unknown>): Record<string, unknown> {
  const full = raw.ga4_full;
  if (full && typeof full === 'object') return full as Record<string, unknown>;
  const ga4 = raw.ga4;
  return ga4 && typeof ga4 === 'object' ? (ga4 as Record<string, unknown>) : {};
}

function matchGscPage(byPage: Record<string, unknown>, pageUrl: string): Record<string, unknown> | null {
  if (pageUrl in byPage) return byPage[pageUrl] as Record<string, unknown>;
  const norm = normalizeUrl(pageUrl);
  for (const [key, val] of Object.entries(byPage)) {
    if (normalizeUrl(key) === norm && val && typeof val === 'object') {
      return val as Record<string, unknown>;
    }
  }
  return null;
}

function matchGa4Path(byPath: Record<string, unknown>, pageUrl: string): Record<string, unknown> | null {
  const path = urlToPath(pageUrl);
  if (path in byPath) return byPath[path] as Record<string, unknown>;
  const norm = normalizeUrl(pageUrl);
  for (const [p, val] of Object.entries(byPath)) {
    if (!val || typeof val !== 'object') continue;
    const row = val as Record<string, unknown>;
    const full = String(row.full_url || '');
    if (full && normalizeUrl(full) === norm) return row;
    if (normalizeUrl(String(p)) === norm || String(p) === path) return row;
  }
  return null;
}

export function publicGscPage(page: Record<string, unknown> | null): PageGscSlice | null {
  if (!page) return null;
  const queries = Array.isArray(page.queries) ? page.queries : [];
  return {
    page: page.page as string | undefined,
    clicks: Number(page.clicks) || 0,
    impressions: Number(page.impressions) || 0,
    ctr: Number(page.ctr) || 0,
    position: Number(page.position) || 0,
    queries: queries
      .filter((q): q is Record<string, unknown> => q != null && typeof q === 'object')
      .sort((a, b) => Number(b.impressions) - Number(a.impressions))
      .slice(0, 25) as PageGscSlice['queries'],
  };
}

export function publicGa4Page(page: Record<string, unknown> | null): PageGa4Slice | null {
  if (!page) return null;
  return {
    path: page.path as string | undefined,
    full_url: page.full_url as string | undefined,
    sessions: Number(page.sessions) || 0,
    activeUsers: Number(page.activeUsers) || 0,
    screenPageViews: Number(page.screenPageViews) || 0,
    engagementRate: Number(page.engagementRate) || 0,
    avgSessionDuration: Number(page.avgSessionDuration) || 0,
  };
}

export function sliceFromGoogleRow(
  raw: Record<string, unknown>,
  pageUrl: string,
): {
  source: 'snapshot';
  gsc: PageGscSlice | null;
  ga4: PageGa4Slice | null;
  coverage: { inCrawl: boolean; inGsc: boolean; inGa4: boolean };
  siteBenchmarks: { gsc: unknown; ga4: unknown };
  dateRange: { start?: string; end?: string };
  fetchedAt: string | null;
} {
  const gscBlob = gscFullBlob(raw);
  const ga4Blob = ga4FullBlob(raw);
  const byPage =
    gscBlob.by_page && typeof gscBlob.by_page === 'object'
      ? (gscBlob.by_page as Record<string, unknown>)
      : {};
  const byPath =
    ga4Blob.by_path && typeof ga4Blob.by_path === 'object'
      ? (ga4Blob.by_path as Record<string, unknown>)
      : {};

  let gscPage = matchGscPage(byPage, pageUrl);
  if (!gscPage && Array.isArray(gscBlob.top_pages)) {
    const norm = normalizeUrl(pageUrl);
    for (const row of gscBlob.top_pages) {
      if (row && typeof row === 'object' && normalizeUrl(String((row as Record<string, unknown>).page)) === norm) {
        gscPage = row as Record<string, unknown>;
        break;
      }
    }
  }

  let ga4Page = matchGa4Path(byPath, pageUrl);
  if (!ga4Page && Array.isArray(ga4Blob.top_pages)) {
    const norm = normalizeUrl(pageUrl);
    for (const row of ga4Blob.top_pages) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      if (r.full_url && normalizeUrl(String(r.full_url)) === norm) {
        ga4Page = r;
        break;
      }
      if (normalizeUrl(String(r.path)) === norm) {
        ga4Page = r;
        break;
      }
    }
  }

  const urlJoin =
    raw.url_join && typeof raw.url_join === 'object'
      ? (raw.url_join as Record<string, unknown>)
      : {};
  const lists =
    urlJoin.lists && typeof urlJoin.lists === 'object'
      ? (urlJoin.lists as Record<string, unknown>)
      : {};
  const norm = normalizeUrl(pageUrl);
  let inGsc = gscPage != null;
  let inGa4 = ga4Page != null;
  let inCrawl = false;
  let inGscOnly = false;
  let inGa4Only = false;
  for (const cat of ['crawl_only', 'gsc_only', 'ga4_only'] as const) {
    const arr = lists[cat];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      const u =
        item && typeof item === 'object' ? String((item as Record<string, unknown>).url || '') : String(item);
      if (u && normalizeUrl(u) === norm) {
        if (cat === 'crawl_only') inCrawl = true;
        if (cat === 'gsc_only') {
          inGsc = true;
          inGscOnly = true;
        }
        if (cat === 'ga4_only') {
          inGa4 = true;
          inGa4Only = true;
        }
        break;
      }
    }
  }
  // A page present in GSC/GA4 but NOT flagged as a Google-only gap is a crawl∩Google
  // match, so it was crawled. Without this, "both" pages report inCrawl=false and
  // wrongly trigger the "in Search Console but not crawled" hint.
  if ((inGsc && !inGscOnly) || (inGa4 && !inGa4Only)) inCrawl = true;

  const dateRangeRaw = raw.date_range;
  let dateRange: { start?: string; end?: string } =
    dateRangeRaw && typeof dateRangeRaw === 'object'
      ? (dateRangeRaw as { start?: string; end?: string })
      : {};
  if (!dateRange.start && gscBlob.date_start) {
    dateRange = {
      start: String(gscBlob.date_start),
      end: String(gscBlob.date_end || ''),
    };
  }

  return {
    source: 'snapshot',
    gsc: publicGscPage(gscPage),
    ga4: publicGa4Page(ga4Page),
    coverage: { inCrawl, inGsc, inGa4 },
    siteBenchmarks: { gsc: gscBlob.summary ?? null, ga4: ga4Blob.summary ?? null },
    dateRange,
    fetchedAt: raw.fetched_at != null ? String(raw.fetched_at) : null,
  };
}

export async function loadGoogleDataRow(
  client: PoolClient,
  googleSnapshotId: number | null,
  propertyId?: number | null,
): Promise<{ id: number; fetchedAt: string | null; raw: Record<string, unknown> } | null> {
  if (googleSnapshotId != null) {
    const { rows } = await client.query(
      'SELECT id, fetched_at, data FROM google_data WHERE id = $1',
      [googleSnapshotId],
    );
    if (!rows.length) return null;
    const raw = parseJsonField(rows[0].data);
    if (!raw) return null;
    return {
      id: Number(rows[0].id),
      fetchedAt: rows[0].fetched_at ? String(rows[0].fetched_at) : null,
      raw,
    };
  }
  if (propertyId != null && propertyId > 0) {
    const { rows } = await client.query(
      'SELECT id, fetched_at, data FROM google_data WHERE property_id = $1 ORDER BY id DESC LIMIT 1',
      [propertyId],
    );
    if (!rows.length) return null;
    const raw = parseJsonField(rows[0].data);
    if (!raw) return null;
    return {
      id: Number(rows[0].id),
      fetchedAt: rows[0].fetched_at ? String(rows[0].fetched_at) : null,
      raw,
    };
  }
  const { rows } = await client.query(
    'SELECT id, fetched_at, data FROM google_data ORDER BY id DESC LIMIT 1',
  );
  if (!rows.length) return null;
  const raw = parseJsonField(rows[0].data);
  if (!raw) return null;
  return {
    id: Number(rows[0].id),
    fetchedAt: rows[0].fetched_at ? String(rows[0].fetched_at) : null,
    raw,
  };
}

export async function resolvePropertyIdForPageGoogle(
  client: PoolClient,
  pageUrl: string,
  propertyIdParam: string | null,
  domainParam: string | null,
): Promise<number | null> {
  const { resolvePropertyIdFromRequest } = await import('./resolvePropertyId');
  if (propertyIdParam) {
    const { propertyId } = await resolvePropertyIdFromRequest(propertyIdParam, null);
    return propertyId;
  }
  if (domainParam) {
    const { propertyId } = await resolvePropertyIdFromRequest(null, domainParam);
    return propertyId;
  }
  try {
    const host = new URL(pageUrl).hostname;
    const { lookupPropertyIdByDomain } = await import('@/lib/loadReportDb');
    return await lookupPropertyIdByDomain(client, host);
  } catch {
    return null;
  }
}

export function historySummary(gsc: PageGscSlice | null, ga4: PageGa4Slice | null) {
  return {
    gsc: gsc
      ? {
          clicks: gsc.clicks,
          impressions: gsc.impressions,
          position: gsc.position,
        }
      : null,
    ga4: ga4
      ? {
          sessions: ga4.sessions,
          engagementRate: ga4.engagementRate,
        }
      : null,
  };
}
