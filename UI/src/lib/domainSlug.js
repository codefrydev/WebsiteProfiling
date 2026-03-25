/**
 * Hostname from absolute URL (lowercase).
 */
export function extractHostname(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Prefer crawl start URL hostname, else first crawled URL — same idea as Home portfolio cards.
 * @param {object} payload - report JSON
 * @param {Map<number, string> | null | undefined} startUrlByRunId - crawl_run id -> start_url
 * @returns {string} e.g. `www.luxtripper.co.uk`, or '' if unknown
 */
export function canonicalDomainFromPayload(payload, startUrlByRunId) {
  if (!payload || typeof payload !== 'object') return '';
  const runId = payload.crawl_run_id != null ? Number(payload.crawl_run_id) : null;
  const runStartUrl =
    runId != null && startUrlByRunId?.get != null
      ? String(startUrlByRunId.get(runId) || '')
      : '';
  const fallbackUrl = String(
    payload?.top_pages?.[0]?.url || payload?.links?.[0]?.url || ''
  );
  const startDomain = extractHostname(runStartUrl);
  const fallbackDomain = extractHostname(fallbackUrl);
  return (startDomain || fallbackDomain || '').toLowerCase();
}

/**
 * Legacy: slug from label when we have no hostname (matches older ?domain= values).
 */
export function slugifyDomain(name) {
  if (name == null || typeof name !== 'string') return '';
  const s = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || '';
}

/** Decode and lowercase for comparison with `canonical_domain` / legacy slugs. */
export function normalizeDomainQueryParam(param) {
  if (param == null || typeof param !== 'string') return '';
  try {
    return decodeURIComponent(param.trim()).toLowerCase();
  } catch {
    return String(param).trim().toLowerCase();
  }
}

/**
 * @param {{ site_name?: string, canonical_domain?: string }} row - from listReportsFromDatabase
 * @param {string} queryParam - value of ?domain=
 */
export function domainQueryMatchesRow(row, queryParam) {
  const p = normalizeDomainQueryParam(queryParam);
  if (!p) return false;
  const host = row.canonical_domain ? String(row.canonical_domain).toLowerCase() : '';
  if (host && host === p) return true;
  if (slugifyDomain(row.site_name || '') === p) return true;
  if (host && slugifyDomain(host) === p) return true;
  if (row.site_name && String(row.site_name).toLowerCase() === p) return true;
  return false;
}
