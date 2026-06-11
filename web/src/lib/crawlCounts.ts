import type { ReportPayload } from '@/types/report';

/** Authoritative crawled URL count from report payload. Never uses max_pages_configured. */
export function crawledUrlCount(data: ReportPayload | null | undefined): number {
  if (!data) return 0;
  const scope = data.report_meta?.crawl_scope?.pages_crawled;
  if (scope != null && Number.isFinite(Number(scope)) && Number(scope) > 0) {
    return Number(scope);
  }
  const summary = data.summary?.total_urls;
  if (summary != null && Number.isFinite(Number(summary)) && Number(summary) > 0) {
    return Number(summary);
  }
  const links = data.links?.length ?? 0;
  return links > 0 ? links : 0;
}

export function crawlLimitConfigured(data: ReportPayload | null | undefined): number | null {
  const max = data?.report_meta?.crawl_scope?.max_pages_configured;
  if (max == null || !Number.isFinite(Number(max)) || Number(max) <= 0) {
    return null;
  }
  return Number(max);
}
