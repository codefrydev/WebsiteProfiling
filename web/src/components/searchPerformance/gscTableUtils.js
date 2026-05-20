/**
 * GSC-specific table helpers for Search Performance.
 */

export {
  PAGE_SIZE,
  paginateSlice,
  filterBySearch,
  truncateLabel,
  exportCsv,
} from '../google/tableUtils';

import { PAGE_SIZE } from '../google/tableUtils';

/** @deprecated Use PAGE_SIZE */
export const DEFAULT_TABLE_ROWS = PAGE_SIZE;

export function filterOpportunities(queries) {
  if (!queries?.length) return [];
  return queries.filter((q) => q.impressions >= 50 && q.ctr < 3);
}

/** Bucket queries/pages by average position for distribution chart. */
export function buildPositionBuckets(rows) {
  const buckets = [0, 0, 0, 0];
  for (const r of rows || []) {
    const pos = parseFloat(r.position);
    if (!pos || pos <= 0) continue;
    if (pos <= 3) buckets[0] += 1;
    else if (pos <= 10) buckets[1] += 1;
    else if (pos <= 20) buckets[2] += 1;
    else buckets[3] += 1;
  }
  return buckets;
}

export function buildQueryExportColumns(sp) {
  return [
    { key: 'query', label: sp.table.query },
    { key: 'clicks', label: sp.table.clicks },
    { key: 'impressions', label: sp.table.impressions },
    { key: 'ctr', label: sp.table.ctr },
    { key: 'position', label: sp.table.position },
  ];
}

export function buildPageExportColumns(sp) {
  return [
    { key: 'page', label: sp.table.page },
    { key: 'clicks', label: sp.table.clicks },
    { key: 'impressions', label: sp.table.impressions },
    { key: 'ctr', label: sp.table.ctr },
    { key: 'position', label: sp.table.position },
  ];
}
