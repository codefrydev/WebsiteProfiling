import { describe, expect, it } from 'vitest';
import {
  buildLanguageBarChartData,
  buildLanguageBarHeights,
  buildLanguageMixSegments,
  duplicateGroupsBand,
  languageShares,
  selectContentConcerns,
  selectTopDuplicateClusters,
  shouldShowContentQuality,
  totalDuplicateMemberPages,
} from './contentQualityMetrics';

describe('contentQualityMetrics', () => {
  it('shows section when duplicates or languages exist', () => {
    expect(shouldShowContentQuality({ content_duplicates: [{ id: 'a', representative_url: 'https://x.com' }] })).toBe(true);
    expect(shouldShowContentQuality({ language_summary: { counts: { en: 10 } } })).toBe(true);
    expect(shouldShowContentQuality({})).toBe(false);
  });

  it('sorts duplicate clusters by member count', () => {
    const clusters = selectTopDuplicateClusters(
      [
        { id: 'a', representative_url: 'https://a.com', member_count: 2 },
        { id: 'b', representative_url: 'https://b.com', member_count: 8 },
      ],
      1,
    );
    expect(clusters[0]?.id).toBe('b');
  });

  it('computes duplicate member totals and bands', () => {
    expect(
      totalDuplicateMemberPages([
        { id: 'a', representative_url: 'https://a.com', member_count: 3 },
        { id: 'b', representative_url: 'https://b.com', member_count: 7 },
      ]),
    ).toBe(10);
    expect(duplicateGroupsBand(10)).toBe('critical');
    expect(duplicateGroupsBand(2)).toBe('fair');
  });

  it('builds language share percentages', () => {
    const shares = languageShares({ en: 90, fr: 10 }, 2);
    expect(shares).toHaveLength(2);
    expect(shares[0]?.lang).toBe('en');
    expect(shares[0]?.pct).toBe(90);
  });

  it('builds language mix donut segments', () => {
    const segments = buildLanguageMixSegments({ en: 90, fr: 10 });
    expect(segments).toHaveLength(2);
    expect(segments[0]?.label).toBe('en');
    expect(segments[0]?.value).toBe(90);
  });

  it('builds language bar heights normalized to max locale', () => {
    expect(buildLanguageBarHeights({ en: 10 })).toBeNull();
    const heights = buildLanguageBarHeights({ en: 80, fr: 40 });
    expect(heights).toHaveLength(2);
    expect(heights![0]).toBe(100);
    expect(heights![1]).toBeGreaterThanOrEqual(22);
  });

  it('builds language bar chart data with labels and sqrt scaling', () => {
    const data = buildLanguageBarChartData({ en: 900, fr: 10, de: 5 });
    expect(data).toHaveLength(3);
    expect(data![0]?.label).toBe('en');
    expect(data![0]?.height).toBe(100);
    expect(data![1]?.height).toBeGreaterThanOrEqual(22);
    expect(data![2]?.height).toBeGreaterThanOrEqual(22);
  });

  it('selects content concerns', () => {
    const concerns = selectContentConcerns({
      duplicateGroups: 10,
      duplicatePages: 40,
      mixedLanguage: true,
      languageCount: 6,
      contentHref: '/content',
      textAnalysisHref: '/text-content-analysis',
      formatDuplicateGroups: (groups, pages) => `${groups}/${pages}`,
      formatMixedLanguage: (languages) => `mixed ${languages}`,
    });
    expect(concerns[0]?.id).toBe('duplicates');
    expect(concerns.some((c) => c.id === 'mixed-language')).toBe(true);
  });
});
