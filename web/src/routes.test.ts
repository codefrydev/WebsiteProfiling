import { describe, expect, it } from 'vitest';
import {
  APP_NAV_ITEMS,
  isStandaloneNavId,
  REPORT_VIEW_IDS,
  STANDALONE_NAV_IDS,
} from '@/lib/appNav';
import { strings } from '@/lib/strings';
import {
  pathSlugToViewId,
  viewIdToPathSlug,
  REPORT_PATH_SLUGS,
} from '@/routes';

const LEGACY_SLUGS = [
  'overview',
  'charts',
  'keywords-explorer',
  'content-studio',
] as const;

const REPORT_NAV_ITEMS = APP_NAV_ITEMS.filter((item) => !isStandaloneNavId(item.id));

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
    for (const slug of LEGACY_SLUGS) {
      expect(pathSlugToViewId(slug)).toBeNull();
    }
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

  it('round-trips every report shell view id', () => {
    for (const viewId of REPORT_VIEW_IDS) {
      const slug = viewIdToPathSlug(viewId);
      expect(pathSlugToViewId(slug), `${viewId} should round-trip`).toBe(viewId);
    }
  });
});

describe('REPORT_PATH_SLUGS', () => {
  it('includes dashboard and keywords but not legacy aliases', () => {
    expect(REPORT_PATH_SLUGS).toContain('dashboard');
    expect(REPORT_PATH_SLUGS).toContain('keywords');
    for (const slug of LEGACY_SLUGS) {
      expect(REPORT_PATH_SLUGS).not.toContain(slug);
    }
  });

  it('resolves every slug to a report shell view id', () => {
    for (const slug of REPORT_PATH_SLUGS) {
      const viewId = pathSlugToViewId(slug);
      expect(viewId, `slug ${slug} should resolve`).not.toBeNull();
      expect(REPORT_VIEW_IDS).toContain(viewId);
    }
  });
});

describe('nav href round-trip', () => {
  it('resolves every report nav item href back to its view id', () => {
    for (const item of REPORT_NAV_ITEMS) {
      const slug = item.hrefPath.replace(/^\//, '');
      const viewId = pathSlugToViewId(slug);
      expect(viewId, `href ${item.hrefPath} should resolve`).toBe(item.id);
    }
  });

  it('does not resolve standalone app routes through pathSlugToViewId', () => {
    for (const id of STANDALONE_NAV_IDS) {
      const item = APP_NAV_ITEMS.find((entry) => entry.id === id);
      expect(item).toBeDefined();
      const slug = item!.hrefPath.replace(/^\//, '');
      expect(pathSlugToViewId(slug), `${item!.hrefPath} is standalone`).toBeNull();
    }
  });
});

describe('registry parity', () => {
  it('keeps report shell views aligned with sidebar nav', () => {
    const navViewIds = REPORT_NAV_ITEMS.map((item) => item.id).sort();
    const shellViewIds = [...REPORT_VIEW_IDS].sort();
    expect(navViewIds).toEqual(shellViewIds);
  });

  it('provides strings.nav labels for every report shell view', () => {
    for (const viewId of REPORT_VIEW_IDS) {
      const entry = strings.nav[viewId as keyof typeof strings.nav];
      expect(entry, `strings.nav.${viewId}`).toBeDefined();
      expect(entry && typeof entry === 'object' && 'label' in entry).toBe(true);
    }
  });

  it('provides strings.nav labels for standalone routes', () => {
    for (const id of STANDALONE_NAV_IDS) {
      const entry = strings.nav[id as keyof typeof strings.nav];
      expect(entry, `strings.nav.${id}`).toBeDefined();
    }
  });
});
