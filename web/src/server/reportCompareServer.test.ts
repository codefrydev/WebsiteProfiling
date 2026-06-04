import { describe, expect, it } from 'vitest';
import { buildReportCompareSummary } from '@/lib/reportCompare';
import { strings } from '@/lib/strings';
import type { ReportPayload } from '@/types/report';

const minimalPayload = (id: number): ReportPayload =>
  ({
    report_generated_at: `2024-01-0${id}`,
    site_name: 'Example',
    summary: { total_urls: 10, count_2xx: 8, count_4xx: 1, count_5xx: 1, success_rate: 80 },
    links: [],
    categories: [],
  }) as ReportPayload;

describe('buildReportCompareSummary', () => {
  it('produces metrics between two payloads', () => {
    const current = minimalPayload(2);
    const baseline = minimalPayload(1);
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
    expect(summary.metrics.length).toBeGreaterThan(0);
    expect(summary.metrics[0]?.current).toBe(10);
  });
});
