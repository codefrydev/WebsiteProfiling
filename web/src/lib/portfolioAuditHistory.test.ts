import { describe, expect, it } from 'vitest';
import { historySeries, parsePortfolioAuditHistory } from './portfolioAuditHistory';

describe('parsePortfolioAuditHistory', () => {
  it('orders oldest to newest and sums issue counts', () => {
    const points = parsePortfolioAuditHistory([
      {
        healthScore: 90,
        issueCounts: { Critical: 1, High: 2, Medium: 3, Low: 4 },
        perfScore: 88,
        seoScore: 91,
        categoryScores: { technical_seo: 85 },
      },
      {
        healthScore: 80,
        issueCounts: { Critical: 0, High: 1, Medium: 1, Low: 0 },
        perfScore: 75,
        seoScore: 82,
        categoryScores: { technical_seo: 78 },
      },
    ]);
    expect(points).toHaveLength(2);
    expect(points[0]).toEqual({
      healthScore: 80,
      totalIssues: 2,
      urgentIssues: 1,
      perfScore: 75,
      seoScore: 82,
      technicalSeoScore: 78,
    });
    expect(points[1]).toEqual({
      healthScore: 90,
      totalIssues: 10,
      urgentIssues: 3,
      perfScore: 88,
      seoScore: 91,
      technicalSeoScore: 85,
    });
  });

  it('extracts sparkline series', () => {
    const points = parsePortfolioAuditHistory([
      { healthScore: 85, issueCounts: { High: 1 }, perfScore: 88, categoryScores: { technical_seo: 85 } },
      { healthScore: 70, issueCounts: { High: 2 }, perfScore: 75, categoryScores: { technical_seo: 78 } },
    ]);
    expect(historySeries(points, 'healthScore')).toEqual([70, 85]);
    expect(historySeries(points, 'urgentIssues')).toEqual([2, 1]);
    expect(historySeries(points, 'perfScore')).toEqual([75, 88]);
    expect(historySeries(points, 'technicalSeoScore')).toEqual([78, 85]);
  });
});
