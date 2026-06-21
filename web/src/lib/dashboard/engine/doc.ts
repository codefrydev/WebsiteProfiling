/**
 * Dashboard document schema (v2) — JSON-serializable, stored verbatim in the
 * `dashboards.layout_json` JSONB column. No functions, no Infinity/NaN.
 */
import type { QuerySpec, VizType, FilterOp, FormatHint } from '@/lib/dashboard/engine/types';

/** Per-widget display options (cosmetic; the query drives the data). */
export interface VizOptions {
  /** Override the auto title shown in KPI/stat-card. */
  subtitle?: string;
  format?: FormatHint;
  /** Decimal places override for chart axis/labels. */
  showLegend?: boolean;
  /** Stack series (bar/area). */
  stacked?: boolean;
  /** Show value labels on chart elements. */
  dataLabels?: boolean;
  /** Color palette id (resolved in the chart theme). */
  palette?: string;
  /** Per-board color overrides per series label. */
  seriesColors?: Record<string, string>;
  /** Threshold bands for KPI / gauge. */
  thresholds?: { value: number; color: string }[];
  /** Gauge/axis bounds. */
  axisMin?: number;
  axisMax?: number;
  /** Max rows rendered by a table widget. */
  tableLimit?: number;
  /** Free text for the `text` viz. */
  text?: string;
}

export interface Widget {
  id: string;
  title: string;
  datasetId: string;
  viz: VizType;
  query: QuerySpec;
  /** Ordered dimensions enabling click-to-drill (e.g. ['host','path_segment','url']). */
  drillDimensions?: string[];
  vizOptions?: VizOptions;
  layout: { x: number; y: number; w: number; h: number };
}

export type SlicerControl = 'select' | 'multiselect' | 'search' | 'date-range';

export interface BoardSlicer {
  id: string;
  label: string;
  /** Field key matched against every widget's dataset (field-identity gate). */
  field: string;
  /** Dataset used to source the field's distinct values in the builder. */
  datasetId: string;
  control: SlicerControl;
  /** Operator used when injecting the slice as a filter. */
  op: FilterOp;
}

export interface BoardTheme {
  palette?: string;
  density?: 'comfortable' | 'compact';
}

export interface DashboardDoc {
  version: 2;
  widgets: Widget[];
  slicers: BoardSlicer[];
  theme?: BoardTheme;
}

export function emptyDashboard(): DashboardDoc {
  return { version: 2, widgets: [], slicers: [] };
}

let _seq = 0;
export function newWidgetId(): string {
  _seq = (_seq + 1) % 1_000_000;
  return `w-${Date.now().toString(36)}-${_seq.toString(36)}`;
}

/** Default grid size (12-col grid) for a freshly-added widget of a given viz. */
export function defaultWidgetLayout(viz: VizType): { x: number; y: number; w: number; h: number } {
  switch (viz) {
    case 'kpi':
    case 'stat-card':
    case 'sparkline':
      return { x: 0, y: 0, w: 3, h: 2 };
    case 'gauge':
      return { x: 0, y: 0, w: 3, h: 3 };
    case 'table':
      return { x: 0, y: 0, w: 8, h: 5 };
    case 'text':
      return { x: 0, y: 0, w: 6, h: 2 };
    default:
      return { x: 0, y: 0, w: 6, h: 4 };
  }
}

/**
 * Coerce an unknown stored document to a valid v2 doc.
 *
 * v2 docs are normalized (filling defaults). Pre-v2 (the old broken
 * audit-tool/DashScript model) cannot be faithfully mapped, so it is reset to
 * an empty board rather than crash the page.
 */
export function migrateDocToV2(raw: unknown): DashboardDoc {
  if (!raw || typeof raw !== 'object') return emptyDashboard();
  const doc = raw as Record<string, unknown>;
  if (doc.version === 2 && Array.isArray(doc.widgets)) {
    return {
      version: 2,
      widgets: (doc.widgets as Widget[]).filter(isValidWidget),
      slicers: Array.isArray(doc.slicers) ? (doc.slicers as BoardSlicer[]) : [],
      theme: (doc.theme as BoardTheme | undefined) ?? undefined,
    };
  }
  return emptyDashboard();
}

function isValidWidget(w: unknown): w is Widget {
  if (!w || typeof w !== 'object') return false;
  const x = w as Record<string, unknown>;
  return (
    typeof x.id === 'string' &&
    typeof x.datasetId === 'string' &&
    typeof x.viz === 'string' &&
    !!x.query &&
    typeof x.query === 'object' &&
    !!x.layout &&
    typeof x.layout === 'object'
  );
}
