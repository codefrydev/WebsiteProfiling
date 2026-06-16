/** When portfolio groups should load relative to report `/meta` readiness. */
export type PortfolioGroupsLoadPlan = 'wait-meta' | 'show-empty' | 'fetch';

export function portfolioGroupsLoadPlan(
  metaLoaded: boolean,
  reportCount: number,
  crawlCount: number,
): PortfolioGroupsLoadPlan {
  if (!metaLoaded) return 'wait-meta';
  if (reportCount === 0 && crawlCount === 0) return 'show-empty';
  return 'fetch';
}
