import { describe, expect, it } from 'vitest';
import { APP_NAV_ITEMS } from '@/lib/appNav';
import {
  pathSlugToViewId,
  viewIdToPathSlug,
  REPORT_PATH_SLUGS,
} from '@/routes';

describe('pathSlugToViewId', () => {
  it('maps canonical aliases to internal view ids', () => {
    expect(pathSlugToViewId('dashboard')).toBe('overview');
    expect(pathSlugToViewId('keywords')).toBe('keywords-explorer');
  });

  it('maps path-equal view ids directly', () => {
    expect(pathSlugToViewId('links')).toBe('links');
    expect(pathSlugToViewId('home')).toBe('home');
  });

  it('rejects non-canonical legacy slugs', () => {
    expect(pathSlugToViewId('overview')).toBeNull();
    expect(pathSlugToViewId('charts')).toBeNull();
    expect(pathSlugToViewId('keywords-explorer')).toBeNull();
  });

  it('rejects invalid slugs', () => {
    expect(pathSlugToViewId('bogus')).toBeNull();
    expect(pathSlugToViewId(null)).toBeNull();
    expect(pathSlugToViewId('')).toBeNull();
  });
});

describe('viewIdToPathSlug', () => {
  it('emits canonical path slugs', () => {
    expect(viewIdToPathSlug('overview')).toBe('dashboard');
    expect(viewIdToPathSlug('keywords-explorer')).toBe('keywords');
    expect(viewIdToPathSlug('links')).toBe('links');
  });
});

describe('REPORT_PATH_SLUGS', () => {
  it('includes dashboard and keywords but not legacy aliases', () => {
    expect(REPORT_PATH_SLUGS).toContain('dashboard');
    expect(REPORT_PATH_SLUGS).toContain('keywords');
    expect(REPORT_PATH_SLUGS).not.toContain('overview');
    expect(REPORT_PATH_SLUGS).not.toContain('charts');
    expect(REPORT_PATH_SLUGS).not.toContain('keywords-explorer');
  });
});

describe('nav href round-trip', () => {
  it('resolves every report nav item href back to its view id', () => {
    const reportItems = APP_NAV_ITEMS.filter(
      (item) => item.id !== 'pipeline' && item.id !== 'chat',
    );

    for (const item of reportItems) {
      const slug = item.hrefPath.replace(/^\//, '');
      const viewId = pathSlugToViewId(slug);
      expect(viewId, `href ${item.hrefPath} should resolve`).toBe(item.id);
    }
  });
});
