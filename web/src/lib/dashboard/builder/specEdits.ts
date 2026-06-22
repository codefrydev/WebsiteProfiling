/**
 * Pure, immutable edits to a QuerySpec, driven by the shelf UI. Keeping these
 * separate from React makes the shelf logic trivially testable.
 */
import type { QuerySpec, MeasureSpec, AggOp, Filter, FilterOp, FilterValue } from '@/lib/dashboard/engine/types';

export function withCategory(spec: QuerySpec, field: string | undefined): QuerySpec {
  return { ...spec, groupBy: field || undefined };
}

export function withSeries(spec: QuerySpec, field: string | undefined): QuerySpec {
  return { ...spec, series: field || undefined };
}

export function withMeasureAdded(spec: QuerySpec, m: MeasureSpec): QuerySpec {
  return { ...spec, measures: [...(spec.measures ?? []), m] };
}

export function withMeasureRemoved(spec: QuerySpec, index: number): QuerySpec {
  return { ...spec, measures: (spec.measures ?? []).filter((_, i) => i !== index) };
}

export function withMeasureAgg(spec: QuerySpec, index: number, agg: AggOp): QuerySpec {
  return {
    ...spec,
    measures: (spec.measures ?? []).map((m, i) => (i === index ? { ...m, agg } : m)),
  };
}

export function withFilterAdded(spec: QuerySpec, filter: Filter): QuerySpec {
  return { ...spec, filters: [...(spec.filters ?? []), filter] };
}

export function withFilterRemoved(spec: QuerySpec, index: number): QuerySpec {
  return { ...spec, filters: (spec.filters ?? []).filter((_, i) => i !== index) };
}

export function withFilterUpdated(
  spec: QuerySpec,
  index: number,
  patch: Partial<Filter>,
): QuerySpec {
  return {
    ...spec,
    filters: (spec.filters ?? []).map((f, i) => (i === index ? { ...f, ...patch } : f)),
  };
}

export function withSort(spec: QuerySpec, by: string | 'category', dir: 'asc' | 'desc'): QuerySpec {
  return { ...spec, sort: { by, dir } };
}

export function withTopN(spec: QuerySpec, n: number | undefined, other: boolean): QuerySpec {
  if (!n || n <= 0) {
    const { topN: _drop, ...rest } = spec;
    void _drop;
    return rest;
  }
  return { ...spec, topN: { n, other } };
}

/** Default filter operator + value for a freshly-dropped field. */
export function defaultFilter(field: string, role: 'dimension' | 'measure'): Filter {
  if (role === 'measure') return { field, op: 'gte', value: 0 };
  return { field, op: 'in', value: [] as FilterValue };
}

/** Operators offered for a field of the given role. */
export function opsForRole(role: 'dimension' | 'measure'): FilterOp[] {
  return role === 'measure'
    ? ['gte', 'lte', 'gt', 'lt', 'between', 'eq', 'neq']
    : ['in', 'eq', 'neq', 'contains'];
}
