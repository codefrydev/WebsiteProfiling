import { describe, expect, it } from 'vitest';
import { isAuditContextReady, portfolioGroupsLoadPlan } from './portfolioLoadPlan';

describe('portfolioGroupsLoadPlan', () => {
  it('fetches groups before meta finishes so home can load in parallel', () => {
    expect(portfolioGroupsLoadPlan(false, 0, 0)).toBe('fetch');
    expect(portfolioGroupsLoadPlan(false, 2, 1)).toBe('fetch');
  });

  it('shows empty only after meta is loaded with no reports or crawls', () => {
    expect(portfolioGroupsLoadPlan(true, 0, 0)).toBe('show-empty');
  });

  it('fetches groups when meta is loaded and data exists', () => {
    expect(portfolioGroupsLoadPlan(true, 1, 0)).toBe('fetch');
    expect(portfolioGroupsLoadPlan(true, 0, 2)).toBe('fetch');
  });
});

describe('isAuditContextReady', () => {
  it('waits for both report meta and pipeline config', () => {
    expect(isAuditContextReady(false, false)).toBe(false);
    expect(isAuditContextReady(true, false)).toBe(false);
    expect(isAuditContextReady(false, true)).toBe(false);
    expect(isAuditContextReady(true, true)).toBe(true);
  });
});
