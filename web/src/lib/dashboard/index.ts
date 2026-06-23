/**
 * Dashboard builder library — types, data layer, viz registry, and UI components.
 *
 * Structure:
 *   catalog/   — semantic data-source catalog for widget picker
 *   data/      — API clients + widget data fetching
 *   viz/       — chart/KPI renderers + registry
 *   builder/   — config panel UI (dataset/viz editor)
 *   canvas/    — v2 react-grid-layout dashboard surface
 *   widgets/   — widget frame + query-driven body
 */

export * from '@/lib/dashboard/types';
export * from '@/lib/dashboard/catalog/catalog';
export * from '@/lib/dashboard/data/fetchWidgetData';
export * from '@/lib/dashboard/data/fetchDashboards';
export * from '@/lib/dashboard/viz/labels';
export { extractMultiSeries, extractChartSeries } from '@/lib/dashboard/viz/series';
export type { SeriesSet, ChartSeries } from '@/lib/dashboard/viz/series';
export { renderViz, VIZ_REGISTRY } from '@/lib/dashboard/viz/registry';
export { evalMeasure, evalTransform, DASHSCRIPT_HELP } from '@/lib/dashboard/script/eval';
export { DashScriptError } from '@/lib/dashboard/script/types';

export { ConfigPanel } from '@/lib/dashboard/builder/ConfigPanel';
export { DASHBOARD_PRESETS, getPreset } from '@/lib/dashboard/presets/presets';
export { default as AiAssistModal } from '@/lib/dashboard/builder/AiAssistModal';
export { DashboardCanvas } from '@/lib/dashboard/canvas/DashboardCanvas';
export {
  generateWidgetScript,
  generateWidget,
  generateDashboard,
  sanitizeChartSpec,
  validateMeasure,
  validateTransform,
  assignLayouts,
  AiGenerateError,
} from '@/lib/dashboard/ai/generate';
