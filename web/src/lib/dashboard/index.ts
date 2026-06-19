/**
 * Dashboard builder library — types, data layer, viz registry, and UI components.
 *
 * Structure:
 *   catalog/   — semantic data-source catalog for widget picker
 *   data/      — API clients + widget data fetching
 *   viz/       — chart/KPI renderers + registry
 *   builder/   — grid, palette, config panel UI
 */

export * from '@/lib/dashboard/types';
export * from '@/lib/dashboard/catalog/catalog';
export * from '@/lib/dashboard/data/fetchWidgetData';
export * from '@/lib/dashboard/data/fetchDashboards';
export * from '@/lib/dashboard/viz/labels';
export { renderViz, VIZ_REGISTRY } from '@/lib/dashboard/viz/registry';
export { evalMeasure, evalTransform, DASHSCRIPT_HELP } from '@/lib/dashboard/script/eval';
export { DashScriptError } from '@/lib/dashboard/script/types';

export { default as DashboardGrid } from '@/lib/dashboard/builder/DashboardGrid';
export { default as DashboardWidget } from '@/lib/dashboard/builder/DashboardWidget';
export { default as DashboardSwitcher } from '@/lib/dashboard/builder/DashboardSwitcher';
export { default as WidgetPalette } from '@/lib/dashboard/builder/WidgetPalette';
export { default as WidgetConfigPanel } from '@/lib/dashboard/builder/WidgetConfigPanel';
export { default as PresetPicker } from '@/lib/dashboard/builder/PresetPicker';
export { DASHBOARD_PRESETS, getDashboardPreset } from '@/lib/dashboard/presets/presets';
export { default as AiAssistModal } from '@/lib/dashboard/builder/AiAssistModal';
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
