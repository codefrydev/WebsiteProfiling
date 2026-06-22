/**
 * Core engine types for the rebuilt dashboard.
 *
 * This module is pure (no React, no network) and owns the contracts shared by
 * the dataset registry, the query engine, and the chart layer. The document
 * schema (DashboardDoc / Widget) lives in `@/lib/dashboard/types` and imports
 * `QuerySpec` / `VizType` from here — so there is no import cycle.
 */
import type { SectionKey } from '@/lib/reportSections';
import type { ReportPayload } from '@/types/report';

/** Visualization types a widget can render. */
export type VizType =
  | 'kpi'
  | 'stat-card'
  | 'gauge'
  | 'bar'
  | 'horizontal-bar'
  | 'stacked-bar'
  | 'line'
  | 'area'
  | 'sparkline'
  | 'pie'
  | 'doughnut'
  | 'scatter'
  | 'radar'
  | 'treemap'
  | 'funnel'
  | 'heatmap'
  | 'table'
  | 'text';

/** A field is either categorical (group-by / axis) or numeric (aggregated). */
export type FieldRole = 'dimension' | 'measure';

/** Aggregation applied when reducing many rows to one value. */
export type AggOp = 'sum' | 'avg' | 'count' | 'countDistinct' | 'min' | 'max' | 'median';

/** Number-format hint (tokens understood by viz/formatters.ts `formatValue`). */
export type FormatHint =
  | '0'
  | '0.0'
  | '0.00'
  | '0.0%'
  | 'pct'
  | 'score'
  | 'ms'
  | 'bytes'
  | string;

export interface FieldDef {
  /** Dot-path key, e.g. `lighthouse.median_metrics.seo_score`. */
  key: string;
  label: string;
  role: FieldRole;
  /** Default aggregation for measures. */
  defaultAgg?: AggOp;
  format?: FormatHint;
  /** True when produced by auto-inference (curated fields win on merge). */
  inferred?: boolean;
  /** Dimension holds a date string — enables chronological sort + date filters. */
  isDate?: boolean;
}

export interface DatasetDef {
  /** Stable id stored on the widget. */
  id: string;
  label: string;
  /** Section that must be loaded (via loadSection) before rows exist. */
  section: SectionKey;
  /** Extract this dataset's rows from the full report payload. */
  accessor: (data: ReportPayload) => Record<string, unknown>[];
  /** Rows are already one-per-category (distributions, GSC top-N). */
  preAggregated?: boolean;
  /** Curated fields, merged over inferred fields. */
  fields: FieldDef[];
  /** Viz types that make sense for this dataset. */
  viz: VizType[];
  /** Default query used when a widget is first created on this dataset. */
  defaultSpec?: Partial<QuerySpec>;
  /** Short description shown in the dataset picker. */
  description?: string;
  /** Grouping section shown in the dataset picker. */
  group?: string;
}

export type FilterOp =
  | 'eq'
  | 'neq'
  | 'in'
  | 'nin'
  | 'contains'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between';

export type FilterValue =
  | string
  | number
  | boolean
  | Array<string | number>
  | [number, number];

export interface Filter {
  field: string;
  op: FilterOp;
  value: FilterValue;
  /** Compare via Date.parse for gt/gte/lt/lte/between. */
  asDate?: boolean;
}

/**
 * Computed measure — the safe, structured replacement for the old DashScript DSL.
 * No `eval`; evaluated by a finite switch, divide-by-zero → null.
 */
export type Operand = { field: string } | { const: number };

export type ComputedField =
  | { kind: 'ratio'; numerator: string; denominator: string; scale?: number }
  | { kind: 'arithmetic'; op: '+' | '-' | '*' | '/'; left: Operand; right: Operand };

export interface MeasureSpec {
  /** Dot-path field; ignored when agg='count' with no field, or when `computed` is set. */
  field: string;
  agg: AggOp;
  label?: string;
  format?: FormatHint;
  /** When set, a synthetic per-row column is computed then aggregated. */
  computed?: ComputedField;
}

export interface SortSpec {
  /** 'category' to sort by the group key, or a measure label to sort by its value. */
  by: 'category' | string;
  dir: 'asc' | 'desc';
}

export interface TopNSpec {
  n: number;
  /** Bucket the remainder into a single "Other" category. */
  other?: boolean;
  otherLabel?: string;
}

export interface QuerySpec {
  filters?: Filter[];
  /** Category dimension (X axis / table grouping). Omit for a single-value KPI. */
  groupBy?: string;
  /** Legend/series dimension (group-by split into multiple series). */
  series?: string;
  /** Omit (or empty) for a detail table; a grouped query with none gets an implicit count. */
  measures?: MeasureSpec[];
  sort?: SortSpec;
  topN?: TopNSpec;
  /** Detail-table column projection (used when there is no groupBy and no measures). */
  columns?: string[];
}

export interface QueryResultSeries {
  key: string;
  label: string;
  values: number[];
}

export interface QueryResult {
  /** Group labels; a single '' entry when ungrouped. */
  categories: string[];
  /** One per series value (series-split), else one per measure. */
  series: QueryResultSeries[];
  /** Denormalized rows for tables / scatter / heatmap / CSV export. */
  table: Record<string, unknown>[];
  /** Single value for KPI / gauge (series[0].values[0]). */
  scalar: number | null;
}
