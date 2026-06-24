/** When portfolio groups should load relative to report `/meta` readiness. */
export type PortfolioGroupsLoadPlan = 'wait-meta' | 'show-empty' | 'fetch';

export function portfolioGroupsLoadPlan(
  metaLoaded: boolean,
  reportCount: number,
  crawlCount: number,
): PortfolioGroupsLoadPlan {
  if (metaLoaded && reportCount === 0 && crawlCount === 0) return 'show-empty';
  return 'fetch';
}

/** Audit tools need pipeline `active_property_id` and report meta before showing empty states. */
export function isAuditContextReady(metaLoaded: boolean, configLoaded: boolean): boolean {
  return metaLoaded && configLoaded;
}
