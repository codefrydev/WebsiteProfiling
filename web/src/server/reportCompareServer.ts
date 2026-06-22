import { buildReportCompareSummary } from '@/lib/reportCompare';
import { computeReportFingerprintDiff } from '@/lib/reportDiff';
import { strings } from '@/lib/strings';
import { fastApiGet } from '@/server/fastApiClient';
import type { ReportCompareSummary } from '@/lib/reportCompare';
import type { ReportFingerprintDiff } from '@/types/report';

import type { ReportPayload } from '@/types/report';

async function getReportPayload(reportId: number): Promise<ReportPayload> {
  const data = await fastApiGet<{ payload: ReportPayload }>(
    `/api/report/payload?reportId=${reportId}`,
  );
  return data.payload;
}

export interface ReportCompareApiResponse {
  summary: ReportCompareSummary;
  reportDiff: ReportFingerprintDiff;
}

export async function buildReportCompareResponse(
  reportId: number,
  baselineId: number,
): Promise<ReportCompareApiResponse> {
  const [current, baseline] = await Promise.all([
    getReportPayload(reportId),
    getReportPayload(baselineId),
  ]);

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

  const reportDiff =
    computeReportFingerprintDiff(current, baseline) ?? summary.fingerprint;

  return { summary, reportDiff };
}
