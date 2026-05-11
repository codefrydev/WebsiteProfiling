import { canonicalDomainFromPayload, extractHostname, slugifyDomain } from './domainSlug';

function scoreFromCategories(categories = []) {
  const numeric = (categories || [])
    .map((c) => Number(c?.score))
    .filter((n) => Number.isFinite(n));
  if (!numeric.length) return null;
  const avg = numeric.reduce((a, b) => a + b, 0) / numeric.length;
  return Math.round(avg);
}

function toLocalDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString();
}

/**
 * Build portfolio domain cards (same logic as Home view useMemo).
 * @param {Array<{ id: number, generated_at: string }>} reportList
 * @param {Map<number, string>} startUrlByRunId
 * @param {Map<number, string>} runCreatedAtByRunId
 * @param {string} unknownBrand
 * @param {string} emDash
 * @param {(reportId: number) => object} getPayload
 */
export function computeDomainGroups(
  reportList,
  startUrlByRunId,
  runCreatedAtByRunId,
  unknownBrand,
  emDash,
  getPayload
) {
  const brandMap = new Map();

  for (const r of reportList) {
    let payload;
    try {
      payload = getPayload(r.id);
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
    const statusCounts = {
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
      runCreatedAt || payload?.crawl_run_created_at || payload?.report_generated_at || r.generated_at
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
        generatedAtMs,
        domainParam: canonicalHost,
      });
    }
  }

  return Array.from(brandMap.values()).sort((a, b) => b.generatedAtMs - a.generatedAtMs);
}
