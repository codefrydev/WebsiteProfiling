import { describe, expect, it } from 'vitest';
import {
  buildKeywordsTabHref,
  formatCrawlPagesSuffix,
  formatGscQuickWinSuffix,
  isJunkCrawlKeyword,
  selectCrawlHighEmphasis,
  selectCrawlQuickWins,
  selectGscOpportunities,
  selectGscQuickWins,
  selectSiteTopKeywords,
  sumGscQuickWinClicks,
} from './overviewKeywordOpportunities';

describe('overviewKeywordOpportunities', () => {
  it('selects GSC quick wins by position and opportunity clicks', () => {
    const rows = [
      { keyword: 'a', gsc_position: 8, opportunity_clicks: 20 },
      { keyword: 'b', gsc_position: 2, opportunity_clicks: 50 },
      { keyword: 'c', gsc_position: 12, opportunity_clicks: 3 },
      { keyword: 'd', gsc_position: 15, opportunity_clicks: 40 },
    ];
    expect(selectGscQuickWins(rows).map((r) => r.keyword)).toEqual(['d', 'a']);
  });

  it('selects expansion opportunities without GSC position', () => {
    const rows = [
      { keyword: 'ranked', gsc_position: 5, sources: ['gsc'] },
      { keyword: 'new', sources: ['suggest'], traffic_potential: 100 },
      { keyword: 'other', sources: ['site'], traffic_potential: 50 },
    ];
    expect(selectGscOpportunities(rows).map((r) => r.keyword)).toEqual(['new', 'other']);
  });

  it('sorts crawl quick wins by sources_count', () => {
    const items = [
      { keyword: 'low', sources_count: 2, relevance: 0.9 },
      { keyword: 'high', sources_count: 10, relevance: 0.2 },
    ];
    expect(selectCrawlQuickWins(items).map((k) => k.keyword)).toEqual(['high', 'low']);
  });

  it('sorts crawl high emphasis by sources_count and volume', () => {
    const items = [
      { keyword: 'b', sources_count: 3, volume: 0.8 },
      { keyword: 'a', sources_count: 8, volume: 0.2 },
    ];
    expect(selectCrawlHighEmphasis(items).map((k) => k.keyword)).toEqual(['a', 'b']);
  });

  it('formats GSC quick win suffix with position', () => {
    expect(formatGscQuickWinSuffix({ keyword: 'x', gsc_position: 9.2, opportunity_clicks: 120 })).toBe(
      '+120 est. clicks · pos 9.2',
    );
  });

  it('formats crawl pages suffix', () => {
    expect(formatCrawlPagesSuffix({ keyword: 'x', sources_count: 4 }, (n) => `on ${n} pages`)).toBe(
      'on 4 pages',
    );
  });

  it('flags heading-tag ngrams as junk', () => {
    expect(isJunkCrawlKeyword('h2 h3')).toBe(true);
    expect(isJunkCrawlKeyword('video games')).toBe(false);
  });

  it('filters junk crawl quick wins', () => {
    const items = [
      { keyword: 'h2 h3', sources_count: 11 },
      { keyword: 'video games', sources_count: 5 },
    ];
    expect(selectCrawlQuickWins(items).map((k) => k.keyword)).toEqual(['video games']);
  });

  it('selects site top keywords from content analytics', () => {
    const items = [
      { word: 'h3 h3', count: 20 },
      { word: 'games', count: 42 },
      { word: 'reviews', count: 18 },
    ];
    expect(selectSiteTopKeywords(items).map((k) => k.keyword)).toEqual(['games', 'reviews']);
  });

  it('sums quick win opportunity clicks', () => {
    const rows = [
      { keyword: 'a', gsc_position: 8, opportunity_clicks: 20 },
      { keyword: 'b', gsc_position: 12, opportunity_clicks: 40 },
    ];
    expect(sumGscQuickWinClicks(rows)).toBe(60);
  });

  it('builds keywords tab href', () => {
    expect(buildKeywordsTabHref('/keywords?domain=x', 'quickwins')).toBe('/keywords?domain=x&tab=quickwins');
    expect(buildKeywordsTabHref('/keywords', 'opportunities')).toBe('/keywords?tab=opportunities');
  });
});
