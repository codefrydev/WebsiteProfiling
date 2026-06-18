import { describe, expect, it } from 'vitest';
import { normalizeSavedView } from './savedLinksView';
import type { LinksFilterValues } from '@/components/links/LinksFilterBar';

const DEFAULT_QUICK: LinksFilterValues = {
  inlinksFilter: 'All',
  statusFilter: 'All',
  rtFilter: 'All',
  wcFilter: 'All',
  jsErrorFilter: 'All',
};

describe('normalizeSavedView', () => {
  it('returns defaults for non-object input', () => {
    expect(normalizeSavedView(null, DEFAULT_QUICK)).toEqual({ quick: DEFAULT_QUICK, advanced: [] });
    expect(normalizeSavedView('x', DEFAULT_QUICK)).toEqual({ quick: DEFAULT_QUICK, advanced: [] });
  });

  it('upgrades a legacy flat LinksFilterValues object', () => {
    const legacy = { statusFilter: '404', wcFilter: 'Thin' };
    expect(normalizeSavedView(legacy, DEFAULT_QUICK)).toEqual({
      quick: { ...DEFAULT_QUICK, statusFilter: '404', wcFilter: 'Thin' },
      advanced: [],
    });
  });

  it('reads the new shape and sanitizes advanced conditions + columns', () => {
    const view = {
      quick: { statusFilter: '200' },
      advanced: [
        { field: 'word_count', op: 'lt', value: '300' },
        { field: 'bogus', op: 'gt', value: '1' },
      ],
      columns: ['status', 'inlinks', 42],
    };
    const out = normalizeSavedView(view, DEFAULT_QUICK);
    expect(out.quick).toEqual({ ...DEFAULT_QUICK, statusFilter: '200' });
    expect(out.advanced).toEqual([{ id: 'saved-0', field: 'word_count', op: 'lt', value: '300' }]);
    expect(out.columns).toEqual(['status', 'inlinks']);
  });
});
