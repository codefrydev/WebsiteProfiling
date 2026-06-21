/**
 * Public type surface for the dashboard module.
 *
 * Kept at this path so existing importers (`@/types/dashboard`,
 * `@/lib/dashboard/data/fetchDashboards`, `@/server/dashboardsDb`) resolve
 * unchanged. The actual definitions live in the engine.
 */
export type {
  VizType,
  FieldRole,
  AggOp,
  FormatHint,
  FieldDef,
  DatasetDef,
  FilterOp,
  FilterValue,
  Filter,
  Operand,
  ComputedField,
  MeasureSpec,
  SortSpec,
  TopNSpec,
  QuerySpec,
  QueryResult,
  QueryResultSeries,
} from '@/lib/dashboard/engine/types';

export type {
  VizOptions,
  Widget,
  SlicerControl,
  BoardSlicer,
  BoardTheme,
  DashboardDoc,
} from '@/lib/dashboard/engine/doc';

export {
  emptyDashboard,
  newWidgetId,
  defaultWidgetLayout,
  migrateDocToV2,
} from '@/lib/dashboard/engine/doc';
