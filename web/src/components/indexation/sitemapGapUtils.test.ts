import { describe, expect, it } from 'vitest';
import { filterUrlRows, urlsToRows } from './sitemapGapUtils';

describe('sitemapGapUtils', () => {
  it('shapes urls into rows', () => {
    expect(urlsToRows(['https://a.com', 'https://b.com'])).toEqual([
      { url: 'https://a.com' },
      { url: 'https://b.com' },
    ]);
  });

  it('filters by global and local search', () => {
    const rows = urlsToRows(['https://a.com/page', 'https://b.com/other']);
    expect(filterUrlRows(rows, 'b.com', '')).toHaveLength(1);
    expect(filterUrlRows(rows, '', 'page')).toHaveLength(1);
    expect(filterUrlRows(rows, 'b.com', 'other')).toHaveLength(1);
    expect(filterUrlRows(rows, 'x', '')).toHaveLength(0);
  });
});
