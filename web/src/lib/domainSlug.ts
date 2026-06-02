import type { ReportListRow, ReportPayload } from '@/types/report';

/** Hostname from absolute URL (lowercase). */
export function extractHostname(url: string | null | undefined): string {
  if (!url || typeof url !== 'string') return '';
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/** Match report builder fallback: configured site_name → start URL host → "Site". */
export function deriveSiteNameFromStartUrl(url: string | null | undefined): string {
  if (!url || typeof url !== 'string') return 'Site';
  try {
    const href = url.trim().startsWith('http') ? url.trim() : `https://${url.trim()}`;
    const host = new URL(href).host;
    return host || 'Site';
  } catch {
    return 'Site';
  }
}

/**
 * Prefer crawl start URL hostname, else first crawled URL — same idea as Home portfolio cards.
 */
export function canonicalDomainFromPayload(
  payload: ReportPayload | null | undefined,
  startUrlByRunId: Map<number, string> | null | undefined,
): string {
  if (!payload || typeof payload !== 'object') return '';
  const runId = payload.crawl_run_id != null ? Number(payload.crawl_run_id) : null;
  const runStartUrl =
    runId != null && startUrlByRunId?.get != null
      ? String(startUrlByRunId.get(runId) || '')
      : '';
  const fallbackUrl = String(
    payload?.top_pages?.[0]?.url || payload?.links?.[0]?.url || '',
  );
  const startDomain = extractHostname(runStartUrl);
  const fallbackDomain = extractHostname(fallbackUrl);
  return (startDomain || fallbackDomain || '').toLowerCase();
}

/** Legacy: slug from label when we have no hostname (matches older ?domain= values). */
export function slugifyDomain(name: string | null | undefined): string {
  if (name == null || typeof name !== 'string') return '';
  const s = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || '';
}

/** Strip leading www. for host comparison. */
function stripWww(host: string): string {
  const h = (host || '').trim().toLowerCase();
  return h.startsWith('www.') ? h.slice(4) : h;
}

/** True when hostnames match exactly or differ only by www. prefix. */
export function hostsMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  const x = String(a).trim().toLowerCase();
  const y = String(b).trim().toLowerCase();
  return x === y || stripWww(x) === stripWww(y);
}

/** Keep only Lighthouse entries whose URL hostname matches expectedHost. */
export function filterLighthouseByHost(
  byUrl: Record<string, unknown>,
  expectedHost: string,
): Record<string, unknown> {
  if (!byUrl || !expectedHost) return byUrl || {};
  const out: Record<string, unknown> = {};
  for (const [url, value] of Object.entries(byUrl)) {
    if (hostsMatch(extractHostname(url), expectedHost)) {
      out[url] = value;
    }
  }
  return out;
}

/** True when global lighthouse_summary belongs to expectedHost (or host unknown). */
export function lighthouseSummaryMatchesHost(
  summary: Record<string, unknown> | null | undefined,
  expectedHost: string,
): boolean {
  if (!summary || typeof summary !== 'object') return false;
  if (!expectedHost) return true;
  const url = summary.url != null ? String(summary.url) : '';
  if (!url) return true;
  return hostsMatch(extractHostname(url), expectedHost);
}

/** Decode and lowercase for comparison with `canonical_domain` / legacy slugs. */
export function normalizeDomainQueryParam(param: string | null | undefined): string {
  if (param == null || typeof param !== 'string') return '';
  let s: string;
  try {
    s = decodeURIComponent(param.trim()).toLowerCase();
  } catch {
    s = String(param).trim().toLowerCase();
  }
  return s.replace(/[,;.\s]+$/g, '');
}

export function domainQueryMatchesRow(row: ReportListRow, queryParam: string): boolean {
  const p = normalizeDomainQueryParam(queryParam);
  if (!p) return false;
  const host = row.canonical_domain ? String(row.canonical_domain).toLowerCase() : '';
  if (host && host === p) return true;
  if (slugifyDomain(row.site_name || '') === p) return true;
  if (host && slugifyDomain(host) === p) return true;
  if (row.site_name && String(row.site_name).toLowerCase() === p) return true;
  return false;
}
