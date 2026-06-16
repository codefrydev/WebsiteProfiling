import { describe, expect, it } from 'vitest';
import { portfolioGroupsLoadPlan } from './portfolioLoadPlan';

describe('portfolioGroupsLoadPlan', () => {
  it('waits for report meta before treating an empty list as final', () => {
    expect(portfolioGroupsLoadPlan(false, 0, 0)).toBe('wait-meta');
    expect(portfolioGroupsLoadPlan(false, 2, 1)).toBe('wait-meta');
  });

  it('shows empty only after meta is loaded with no reports or crawls', () => {
    expect(portfolioGroupsLoadPlan(true, 0, 0)).toBe('show-empty');
  });

  it('fetches groups once meta is loaded and data exists', () => {
    expect(portfolioGroupsLoadPlan(true, 1, 0)).toBe('fetch');
    expect(portfolioGroupsLoadPlan(true, 0, 2)).toBe('fetch');
  });
});
