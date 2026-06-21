/**
 * Dashboard module — public API.
 *
 *   engine/   pure data engine: dataset registry, query engine, doc schema
 *   charts/   ECharts renderer + option builders + theme (echarts isolated here)
 *   widgets/  per-widget presenters (KPI/table/text/chart) + frame
 *   canvas/   react-grid-layout board
 *   builder/  drag-and-drop authoring (shelves, gallery, format)
 *   interaction/ slicers, cross-filter, drill
 *   hooks/    React adapters over ReportContext
 *   data/     dashboards CRUD client
 */

// Types + doc schema
export * from '@/lib/dashboard/types';

// Engine
export { runQuery, measureLabel } from '@/lib/dashboard/engine/runQuery';
export { runQueryCached, rowsForDataset, clearDatasetRowCache } from '@/lib/dashboard/engine/memo';
export { inferFields, mergeFields } from '@/lib/dashboard/engine/inferFields';
export { applyFilters, hasFilterValue } from '@/lib/dashboard/engine/filter';
export { DATASETS, datasetById, getDataset, datasetsByGroup } from '@/lib/dashboard/engine/datasets';

// Charts
export { default as ChartRenderer } from '@/lib/dashboard/charts/ChartRenderer';
export { isEChartsViz, VIZ_TO_OPTION } from '@/lib/dashboard/charts/optionBuilders';
export { VIZ_META, VIZ_LABELS, ALL_VIZ, vizFitsSpec } from '@/lib/dashboard/charts/vizMeta';
export { formatValue, thresholdColor } from '@/lib/dashboard/charts/format';
export { buildChartTheme, PALETTE_IDS } from '@/lib/dashboard/charts/theme';
export type { EChartsInstance } from '@/lib/dashboard/charts/echartsCore';

// Widgets + canvas
export { WidgetFrame } from '@/lib/dashboard/widgets/WidgetFrame';
export { DashboardCanvas } from '@/lib/dashboard/canvas/DashboardCanvas';

// Builder
export { ConfigPanel } from '@/lib/dashboard/builder/ConfigPanel';

// Presets + export
export { DASHBOARD_PRESETS, getPreset } from '@/lib/dashboard/presets/presets';
export { tableToCsv, downloadCsv } from '@/lib/dashboard/export/csv';
export { chartToPng } from '@/lib/dashboard/export/png';

// Interaction
export { SlicerBar } from '@/lib/dashboard/interaction/SlicerBar';
export {
  applyInteractions,
  advanceDrill,
  type CrossFilter,
  type DrillState,
  type InteractionState,
} from '@/lib/dashboard/interaction/applyInteractions';

// Hooks
export { usePropertyForDomain } from '@/lib/dashboard/hooks/usePropertyForDomain';
export { useWidgetQuery, useDatasetRows, type WidgetStatus } from '@/lib/dashboard/hooks/useWidgetQuery';

// Data CRUD
export * from '@/lib/dashboard/data/fetchDashboards';
