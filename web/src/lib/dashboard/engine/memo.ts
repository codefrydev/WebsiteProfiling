/**
 * Client-side memoization so a board of widgets is cheap:
 *  - dataset row extraction is memoized per (datasetId, reportId) + payload identity
 *    (shared across every widget on the same dataset within one data snapshot);
 *  - query results are memoized per (rows identity, spec hash) via a WeakMap keyed
 *    by the (stable) rows array.
 */
import type { ReportPayload } from '@/types/report';
import type { QuerySpec, QueryResult } from '@/lib/dashboard/engine/types';
import { datasetById } from '@/lib/dashboard/engine/datasets';
import { runQuery } from '@/lib/dashboard/engine/runQuery';
import { stableStringify } from '@/lib/dashboard/engine/specHash';

interface RowsCacheEntry {
  data: ReportPayload;
  rows: Record<string, unknown>[];
}
const rowsCache = new Map<string, RowsCacheEntry>();

/** Extract (and cache) a dataset's rows from the current report payload. */
export function rowsForDataset(
  data: ReportPayload,
  datasetId: string,
  reportId: number | null,
): Record<string, unknown>[] {
  const def = datasetById.get(datasetId);
  if (!def) return [];
  const key = `${datasetId}:${reportId ?? 'latest'}`;
  const cached = rowsCache.get(key);
  if (cached && cached.data === data) return cached.rows;
  const rows = def.accessor(data) ?? [];
  rowsCache.set(key, { data, rows });
  return rows;
}

const queryCache = new WeakMap<Record<string, unknown>[], Map<string, QueryResult>>();

/** Run a query with per-(rows, spec) memoization. */
export function runQueryCached(rows: Record<string, unknown>[], spec: QuerySpec): QueryResult {
  let perRows = queryCache.get(rows);
  if (!perRows) {
    perRows = new Map();
    queryCache.set(rows, perRows);
  }
  const hash = stableStringify(spec);
  const hit = perRows.get(hash);
  if (hit) return hit;
  const result = runQuery(rows, spec);
  perRows.set(hash, result);
  return result;
}

/** Test/maintenance helper. */
export function clearDatasetRowCache(): void {
  rowsCache.clear();
}
