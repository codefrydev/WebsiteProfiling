import { describe, expect, it } from 'vitest';
import {
  filterBacklinkAnchors,
  filterBacklinkDomains,
  filterBacklinkPages,
  filterBacklinkSample,
  firstBacklinksTabWithMatches,
} from './backlinksSearch';

describe('backlinksSearch', () => {
  it('filters domain rows', () => {
    const rows = [{ site: 'example.com' }, { site: 'other.org' }];
    expect(filterBacklinkDomains(rows, 'example')).toHaveLength(1);
    expect(filterBacklinkDomains(rows, '')).toHaveLength(2);
  });

  it('filters page and anchor rows', () => {
    expect(filterBacklinkPages([{ target_page: 'https://x.com/a' }], 'x.com')).toHaveLength(1);
    expect(filterBacklinkAnchors([{ anchor_text: 'click here' }], 'click')).toHaveLength(1);
  });

  it('filters sample link rows across fields', () => {
    const rows = [{ source_page: 'https://ref.com', target_page: 'https://site.com' }];
    expect(filterBacklinkSample(rows, 'ref.com')).toHaveLength(1);
    expect(filterBacklinkSample(rows, 'missing')).toHaveLength(0);
  });

  it('picks first tab with matches', () => {
    expect(
      firstBacklinksTabWithMatches('x', {
        domains: 0,
        pages: 2,
        anchors: 5,
        sample: 1,
      }),
    ).toBe('pages');
    expect(firstBacklinksTabWithMatches('', { domains: 1, pages: 0, anchors: 0, sample: 0 })).toBeNull();
  });
});
