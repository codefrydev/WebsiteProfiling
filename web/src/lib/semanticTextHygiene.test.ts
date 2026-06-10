import { describe, expect, it } from 'vitest';
import { filterSemanticTerms, filterTopicClusters, isJunkSemanticTerm } from './semanticTextHygiene';

describe('semanticTextHygiene', () => {
  it('flags heading-tag ngrams as junk', () => {
    expect(isJunkSemanticTerm('h2 h3')).toBe(true);
    expect(isJunkSemanticTerm('video games')).toBe(false);
  });

  it('filters site keyword lists', () => {
    const items = [
      { word: 'h3 h3', count: 10 },
      { word: 'games', count: 42 },
    ];
    expect(filterSemanticTerms(items).map((i) => i.word)).toEqual(['games']);
  });

  it('filters topic clusters', () => {
    const clusters = [
      { top_keyword: 'h2 h2', keywords: ['h2', 'h2 h2'] },
      { top_keyword: 'games', keywords: ['games', 'reviews'] },
    ];
    expect(filterTopicClusters(clusters).map((c) => c.top_keyword)).toEqual(['games']);
  });
});
