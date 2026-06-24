import { apiFetch, reportApi } from './publicBase';
import { buildReportCompareSummary, type ReportCompareSummary } from './reportCompare';
import { computeReportFingerprintDiff } from './reportDiff';
import { strings } from './strings';
import type { ReportFingerprintDiff, ReportPayload } from '@/types/report';

export interface ReportCompareResult {
  summary: ReportCompareSummary;
  reportDiff: ReportFingerprintDiff;
}

/**
 * Compare two reports entirely in the browser. The comparison is pure computation over the two
 * payloads; only the payload fetches hit the network — and those go through the BFF (apiFetch).
 * This replaces the former Next.js /api/report/compare server route so the browser talks only to
 * the BFF. (Logic mirrors the old reportCompareServer.ts exactly.)
 */
async function fetchPayload(reportId: number): Promise<ReportPayload> {
  const res = await apiFetch(reportApi(`/payload?reportId=${encodeURIComponent(String(reportId))}`));
  if (!res.ok) {
    throw new Error(`payload ${reportId} → ${res.status}`);
  }
  const body = (await res.json()) as { payload: ReportPayload };
  return body.payload;
}

export async function loadReportCompare(
  reportId: number,
  baselineId: number,
): Promise<ReportCompareResult> {
  const [current, baseline] = await Promise.all([fetchPayload(reportId), fetchPayload(baselineId)]);

  const vo = strings.views.overview;
  const c = strings.views.compare;
  const m = c.metrics;

  const summary = buildReportCompareSummary(
    current,
    baseline,
    {
      totalUrls: vo.totalUrls,
      successRate: vo.successRate,
      count4xx: vo.broken,
      count5xx: m.count5xx,
      healthScore: m.healthScore,
      auditIssues: m.auditIssues,
      securityFindings: m.securityFindings,
      avgPerformance: m.avgPerformance,
      avgSeoScore: m.avgSeoScore,
    },
    {
      linkMetrics: c.linkMetrics,
      content: c.contentMetrics,
      google: c.googleMetrics,
    },
  );

  const reportDiff = computeReportFingerprintDiff(current, baseline) ?? summary.fingerprint;
  return { summary, reportDiff };
}
