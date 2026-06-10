import { describe, expect, it } from 'vitest';
import { buildByPageTextRows } from './textContentAnalysis';

describe('buildByPageTextRows', () => {
  it('builds rows from 2xx links with top terms', () => {
    const rows = buildByPageTextRows(
      [
        {
          url: 'https://example.com/a',
          status: '200',
          word_count: 500,
          top_keywords: JSON.stringify([{ word: 'games', count: 5 }]),
          reading_level: 8,
        },
      ],
      '',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].url).toBe('https://example.com/a');
    expect(rows[0].word_count).toBe(500);
    expect(rows[0].top_terms).toContain('games');
  });

  it('skips non-2xx and filters by search', () => {
    const rows = buildByPageTextRows(
      [
        { url: 'https://example.com/404', status: '404', word_count: 100, top_keywords: '[]' },
        {
          url: 'https://example.com/blog',
          status: '200',
          word_count: 200,
          top_keywords: JSON.stringify([{ word: 'reviews', count: 2 }]),
        },
      ],
      'blog',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].url).toContain('blog');
  });
});
