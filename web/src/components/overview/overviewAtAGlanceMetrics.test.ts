import { describe, expect, it } from 'vitest';
import {
  buildGscBarHeights,
  buildGscSparklinePoints,
  buildIssueMixSegments,
  countIssuesByPriority,
  pickLighthouseHighlights,
  shouldShowAtAGlance,
} from './overviewAtAGlanceMetrics';

describe('overviewAtAGlanceMetrics', () => {
  it('counts issues by priority', () => {
    const counts = countIssuesByPriority([
      {
        id: 'seo',
        name: 'SEO',
        issues: [
          { priority: 'Critical', message: 'a' },
          { priority: 'High', message: 'b' },
          { priority: 'Medium', message: 'c' },
          { priority: 'Low', message: 'd' },
        ],
      },
    ]);
    expect(counts).toEqual({ critical: 1, high: 1, medium: 1, low: 1, total: 4 });
  });

  it('builds issue mix segments excluding critical', () => {
    const segments = buildIssueMixSegments({
      critical: 5,
      high: 22,
      medium: 45,
      low: 33,
      total: 105,
    });
    expect(segments).toHaveLength(3);
    expect(segments.map((s) => s.label)).toEqual(['High', 'Medium', 'Low']);
    expect(segments[0]?.value).toBe(22);
  });

  it('returns null for gsc bar heights with fewer than 2 days', () => {
    expect(buildGscBarHeights([])).toBeNull();
    expect(buildGscBarHeights([{ date: '2024-01-01', clicks: 10 }])).toBeNull();
  });

  it('normalizes gsc bar heights to 0–100', () => {
    const heights = buildGscBarHeights([
      { date: '2024-01-01', clicks: 10 },
      { date: '2024-01-02', clicks: 20 },
      { date: '2024-01-03', clicks: 5 },
    ]);
    expect(heights).toEqual([50, 100, 25]);
  });

  it('builds gsc sparkline points', () => {
    const points = buildGscSparklinePoints([
      { date: '2024-01-01', clicks: 1 },
      { date: '2024-01-02', clicks: 3 },
    ]);
    expect(points).toEqual([1, 3]);
  });

  it('picks lighthouse highlights for perf, seo, and a11y', () => {
    const highlights = pickLighthouseHighlights({
      performance: 84,
      seo: 96,
      accessibility: 88,
      'best-practices': 90,
    });
    expect(highlights.map((h) => h.id)).toEqual(['performance', 'seo', 'accessibility']);
    expect(highlights[0]?.score).toBe(84);
  });

  it('shouldShowAtAGlance is false when no data', () => {
    expect(shouldShowAtAGlance({})).toBe(false);
  });

  it('shouldShowAtAGlance is true when urls or issues exist', () => {
    expect(shouldShowAtAGlance({ urlCount: 100 })).toBe(true);
    expect(
      shouldShowAtAGlance({
        issueCounts: { critical: 0, high: 1, medium: 0, low: 0, total: 1 },
      }),
    ).toBe(true);
  });
});
