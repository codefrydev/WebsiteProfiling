/** Visualization types available for dashboard widgets. */
export type VizType =
  | 'kpi'
  | 'stat-card'
  | 'gauge'
  | 'bar'
  | 'horizontal-bar'
  | 'ranked-bar'
  | 'stacked-bar'
  | 'line'
  | 'area'
  | 'sparkline'
  | 'pie'
  | 'doughnut'
  | 'table'
  | 'markdown'
  | 'custom-chart';

/**
 * Raw Chart.js configuration emitted by the AI.
 * Must be pure JSON — no functions or executable code.
 */
export interface CustomChartSpec {
  /** Chart.js chart type (bar, line, pie, radar, polarArea, doughnut, bubble, scatter, …). */
  type: string;
  /** Optional fully-formed Chart.js data object (datasets, labels). Used as-is when present. */
  data?: Record<string, unknown>;
  /** Column name used as category labels when building data from rows. */
  labelField?: string;
  /** Series definitions used when building data from rows. */
  series?: { label: string; field: string; backgroundColor?: string; borderColor?: string }[];
  /** Passed through to Chart.js options (no functions allowed). */
  options?: Record<string, unknown>;
}

/** Aggregation to apply when reducing an array result to a single number. */
export type AggregateOp = 'sum' | 'avg' | 'count' | 'max' | 'min' | 'none';

export type ChartSortOrder = 'none' | 'asc' | 'desc';

/** Where the widget fetches its data. */
export interface WidgetBinding {
  source: 'audit-tool';
  toolName: string;
  args?: Record<string, unknown>;
  select?: string;
  xField?: string;
  yField?: string;
  valueField?: string;
  aggregate?: AggregateOp;
  /**
   * DashScript measure — scalar formula evaluated after data fetch.
   * Example: `sum("count")`, `field("health_score")`, `if(score >= 80, "Good", "Poor")`
   */
  measure?: string;
  /**
   * DashScript transform pipeline applied to rows before chart/table render.
   * Example: `filter(count > 0) | sort(score, desc) | take(10)`
   */
  transform?: string;
  /** When true, measure/transform override simple field bindings. */
  useScript?: boolean;
}

export interface WidgetLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Per-widget display options (colors, format strings, thresholds, etc.). */
export interface WidgetOptions {
  format?: string;
  title?: string;
  thresholds?: { value: number; color: string }[];
  tableLimit?: number;
  markdownContent?: string;
  /** Max categories/points shown in chart widgets. */
  chartMaxItems?: number;
  /** Sort chart rows by yField before rendering. */
  chartSort?: ChartSortOrder;
  /** Show Chart.js legend when supported. */
  showLegend?: boolean;
  /** Optional subtitle for stat-card widgets. */
  subtitle?: string;
  /**
   * Raw Chart.js config for custom-chart viz.
   * AI-generated; sanitized before use (no functions).
   */
  chartSpec?: CustomChartSpec;
  /** The AI prompt that produced this widget — stored for re-generation. */
  aiPrompt?: string;
}

export interface Widget {
  id: string;
  layout: WidgetLayout;
  title: string;
  viz: VizType;
  binding: WidgetBinding;
  options?: WidgetOptions;
}

export interface DashboardDoc {
  version: 1;
  widgets: Widget[];
}

export function emptyDashboard(): DashboardDoc {
  return { version: 1, widgets: [] };
}

export function newWidgetId(): string {
  return `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Default grid size when adding a widget of a given viz type. */
export function defaultWidgetLayout(viz: VizType): WidgetLayout {
  switch (viz) {
    case 'kpi':
    case 'sparkline':
    case 'stat-card':
      return { x: 0, y: Infinity, w: 3, h: 2 };
    case 'gauge':
      return { x: 0, y: Infinity, w: 3, h: 3 };
    case 'table':
      return { x: 0, y: Infinity, w: 8, h: 5 };
    case 'markdown':
      return { x: 0, y: Infinity, w: 6, h: 3 };
    case 'stacked-bar':
      return { x: 0, y: Infinity, w: 6, h: 2 };
    case 'custom-chart':
      return { x: 0, y: Infinity, w: 6, h: 4 };
    default:
      return { x: 0, y: Infinity, w: 5, h: 4 };
  }
}
