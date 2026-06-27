import { describe, it, expect } from 'vitest';
import { siteHealthScoreFromCategories, siteHealthScoreFromPayload } from './siteHealthScore';
import type { ReportCategory } from '@/types/report';

const weightedCategories: ReportCategory[] = [
  { id: 'technical_seo', name: 'Technical SEO', score: 80, issues: [] },
  { id: 'link_health', name: 'Link Health', score: 60, issues: [] },
  { id: 'performance', name: 'Performance', score: 70, issues: [] },
  { id: 'security', name: 'Security', score: 90, issues: [] },
  { id: 'core_web_vitals', name: 'CWV', score: 50, issues: [] },
  { id: 'mobile', name: 'Mobile', score: 40, issues: [] },
  { id: 'html_accessibility', name: 'A11y', score: 100, issues: [] },
  { id: 'search_performance', name: 'Search', score: 10, issues: [] },
  { id: 'intelligence', name: 'Intel', score: 0, issues: [] },
];

describe('siteHealthScoreFromCategories', () => {
  it('weights fixable categories and excludes search_performance and intelligence', () => {
    // 80*0.25 + 60*0.2 + 70*0.15 + 90*0.15 + 50*0.1 + 40*0.1 + 100*0.05 = 69.5 → 70
    expect(siteHealthScoreFromCategories(weightedCategories)).toBe(70);
  });
});

describe('siteHealthScoreFromPayload', () => {
  it('prefers summary.site_health_score over portfolio benchmark', () => {
    expect(
      siteHealthScoreFromPayload({
        summary: { site_health_score: 72 },
        site_health_score: 65,
        categories: weightedCategories,
      }),
    ).toBe(72);
  });

  it('falls back to weighted category score when payload field missing', () => {
    expect(siteHealthScoreFromPayload({ categories: weightedCategories })).toBe(70);
  });
});
