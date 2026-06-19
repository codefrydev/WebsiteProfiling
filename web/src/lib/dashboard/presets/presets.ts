import { catalogEntry, defaultDimension, defaultMeasure } from '@/lib/dashboard/catalog/catalog';
import {
  newWidgetId,
  type DashboardDoc,
  type VizType,
  type Widget,
  type WidgetBinding,
  type WidgetLayout,
  type WidgetOptions,
} from '@/lib/dashboard/types';

export interface DashboardPreset {
  id: string;
  name: string;
  description: string;
  /** Short label for compact UI (e.g. switcher). */
  tagline: string;
  build: () => DashboardDoc;
}

type PresetWidgetDef = {
  title?: string;
  toolName: string;
  viz: VizType;
  layout: WidgetLayout;
  binding?: Partial<WidgetBinding>;
  options?: WidgetOptions;
};

function buildWidget(def: PresetWidgetDef): Widget {
  const cat = catalogEntry(def.toolName);
  const binding: WidgetBinding = {
    source: 'audit-tool',
    toolName: def.toolName,
    args: cat?.defaultArgs,
    valueField: cat ? defaultMeasure(cat) : undefined,
    xField: cat ? defaultDimension(cat) : undefined,
    yField: cat ? defaultMeasure(cat) : undefined,
    select: cat?.rowsPath,
    ...def.binding,
  };
  return {
    id: newWidgetId(),
    title: def.title ?? cat?.label ?? def.toolName,
    viz: def.viz,
    binding,
    layout: def.layout,
    options: def.options,
  };
}

function buildDoc(widgets: PresetWidgetDef[]): DashboardDoc {
  return { version: 1, widgets: widgets.map(buildWidget) };
}

const AUDIT_OVERVIEW = buildDoc([
  {
    toolName: 'get_report_summary',
    viz: 'kpi',
    title: 'Health score',
    layout: { x: 0, y: 0, w: 3, h: 2 },
    binding: { valueField: 'health_score' },
    options: { format: '0' },
  },
  {
    toolName: 'get_report_summary',
    viz: 'stat-card',
    title: 'Total URLs',
    layout: { x: 3, y: 0, w: 3, h: 2 },
    binding: { valueField: 'crawl_summary.total_urls' },
  },
  {
    toolName: 'get_report_summary',
    viz: 'stat-card',
    title: 'Total issues',
    layout: { x: 6, y: 0, w: 3, h: 2 },
    binding: { valueField: 'total_issues' },
  },
  {
    toolName: 'get_report_summary',
    viz: 'stat-card',
    title: 'Pages OK (2xx)',
    layout: { x: 9, y: 0, w: 3, h: 2 },
    binding: { valueField: 'crawl_summary.count_2xx' },
  },
  {
    toolName: 'get_category_scores',
    viz: 'horizontal-bar',
    title: 'Category scores',
    layout: { x: 0, y: 2, w: 7, h: 4 },
    binding: { select: 'categories', xField: 'name', yField: 'score' },
    options: { chartSort: 'desc' },
  },
  {
    toolName: 'get_critical_issues',
    viz: 'table',
    title: 'Top critical issues',
    layout: { x: 7, y: 2, w: 5, h: 4 },
    binding: { select: 'issues', args: { limit: 10 } },
    options: { tableLimit: 10 },
  },
]);

const PERFORMANCE = buildDoc([
  {
    toolName: 'get_lighthouse_summary',
    viz: 'gauge',
    title: 'Performance',
    layout: { x: 0, y: 0, w: 4, h: 3 },
    binding: { valueField: 'summary.category_scores.performance' },
    options: {
      thresholds: [
        { value: 50, color: '#ef4444' },
        { value: 90, color: '#eab308' },
        { value: 100, color: '#22c55e' },
      ],
    },
  },
  {
    toolName: 'get_lighthouse_summary',
    viz: 'kpi',
    title: 'Accessibility',
    layout: { x: 4, y: 0, w: 2, h: 2 },
    binding: { valueField: 'summary.category_scores.accessibility' },
  },
  {
    toolName: 'get_lighthouse_summary',
    viz: 'kpi',
    title: 'Best practices',
    layout: { x: 6, y: 0, w: 2, h: 2 },
    binding: { valueField: 'summary.category_scores.best-practices' },
  },
  {
    toolName: 'get_lighthouse_summary',
    viz: 'kpi',
    title: 'SEO',
    layout: { x: 8, y: 0, w: 2, h: 2 },
    binding: { valueField: 'summary.category_scores.seo' },
  },
  {
    toolName: 'get_lighthouse_summary',
    viz: 'stat-card',
    title: 'Pages audited',
    layout: { x: 10, y: 0, w: 2, h: 2 },
    binding: { valueField: 'pages_audited' },
  },
]);

const SEO_QUALITY = buildDoc([
  {
    toolName: 'get_image_audit_summary',
    viz: 'kpi',
    title: 'Pages missing alt',
    layout: { x: 0, y: 0, w: 3, h: 2 },
    binding: { valueField: 'pages_missing_alt' },
  },
  {
    toolName: 'get_image_audit_summary',
    viz: 'stat-card',
    title: 'Images crawled',
    layout: { x: 3, y: 0, w: 3, h: 2 },
    binding: { valueField: 'images_total_crawled' },
  },
  {
    toolName: 'get_axe_audit_summary',
    viz: 'kpi',
    title: 'A11y violations',
    layout: { x: 6, y: 0, w: 3, h: 2 },
    binding: { valueField: 'total_violations' },
  },
  {
    toolName: 'get_axe_audit_summary',
    viz: 'stat-card',
    title: 'Pages with violations',
    layout: { x: 9, y: 0, w: 3, h: 2 },
    binding: { valueField: 'pages_with_violations' },
  },
  {
    toolName: 'list_broken_links',
    viz: 'table',
    title: 'Broken links',
    layout: { x: 0, y: 2, w: 8, h: 5 },
    binding: { select: 'broken', args: { limit: 25 } },
    options: { tableLimit: 25 },
  },
  {
    toolName: 'list_largest_images',
    viz: 'table',
    title: 'Largest images',
    layout: { x: 8, y: 2, w: 4, h: 5 },
    binding: { select: 'items', args: { limit: 10 } },
    options: { tableLimit: 10 },
  },
]);

const GEO_AEO = buildDoc([
  {
    toolName: 'get_geo_readiness_score',
    viz: 'gauge',
    title: 'GEO readiness',
    layout: { x: 0, y: 0, w: 4, h: 3 },
    binding: { valueField: 'geo_readiness_score' },
    options: {
      thresholds: [
        { value: 40, color: '#ef4444' },
        { value: 70, color: '#eab308' },
        { value: 100, color: '#22c55e' },
      ],
    },
  },
  {
    toolName: 'get_agent_readiness_score',
    viz: 'kpi',
    title: 'Agent readiness',
    layout: { x: 4, y: 0, w: 4, h: 2 },
    binding: { valueField: 'agent_readiness_score' },
  },
  {
    toolName: 'get_citability_score',
    viz: 'kpi',
    title: 'Citability',
    layout: { x: 8, y: 0, w: 4, h: 2 },
    binding: { valueField: 'citability_score' },
  },
  {
    toolName: 'get_eeat_signals_summary',
    viz: 'stat-card',
    title: 'Pages w/ author schema',
    layout: { x: 4, y: 2, w: 4, h: 2 },
    binding: { valueField: 'pages_with_author_schema' },
  },
  {
    toolName: 'get_geo_readiness_score',
    viz: 'stat-card',
    title: 'Schema coverage',
    layout: { x: 0, y: 3, w: 3, h: 2 },
    binding: { valueField: 'components.schema_coverage' },
    options: { format: 'pct' },
  },
  {
    toolName: 'get_geo_readiness_score',
    viz: 'stat-card',
    title: 'FAQ coverage',
    layout: { x: 3, y: 3, w: 3, h: 2 },
    binding: { valueField: 'components.faq_schema_coverage' },
    options: { format: 'pct' },
  },
  {
    toolName: 'get_geo_readiness_score',
    viz: 'stat-card',
    title: 'Robots AI access',
    layout: { x: 6, y: 3, w: 3, h: 2 },
    binding: { valueField: 'components.robots_ai_access' },
    options: { format: 'pct' },
  },
  {
    toolName: 'get_citability_score',
    viz: 'stat-card',
    title: 'Pages above 50',
    layout: { x: 9, y: 2, w: 3, h: 3 },
    binding: { valueField: 'pages_above_50' },
  },
]);

const SEARCH_CONSOLE = buildDoc([
  {
    toolName: 'get_google_summary',
    viz: 'kpi',
    title: 'Total clicks',
    layout: { x: 0, y: 0, w: 3, h: 2 },
    binding: { valueField: 'gsc.summary.clicks' },
  },
  {
    toolName: 'get_google_summary',
    viz: 'stat-card',
    title: 'Impressions',
    layout: { x: 3, y: 0, w: 3, h: 2 },
    binding: { valueField: 'gsc.summary.impressions' },
  },
  {
    toolName: 'get_google_summary',
    viz: 'stat-card',
    title: 'Avg. position',
    layout: { x: 6, y: 0, w: 3, h: 2 },
    binding: { valueField: 'gsc.summary.position' },
    options: { format: '0.0' },
  },
  {
    toolName: 'get_google_summary',
    viz: 'stat-card',
    title: 'Avg. CTR',
    layout: { x: 9, y: 0, w: 3, h: 2 },
    binding: { valueField: 'gsc.summary.ctr' },
    options: { format: '0.00%' },
  },
]);

export const DASHBOARD_PRESETS: DashboardPreset[] = [
  {
    id: 'audit-overview',
    name: 'Audit overview',
    tagline: 'Health, categories & issues',
    description: 'Health score, page counts, category breakdown, and top critical issues.',
    build: () => cloneDoc(AUDIT_OVERVIEW),
  },
  {
    id: 'performance',
    name: 'Performance',
    tagline: 'Lighthouse scores',
    description: 'Core Lighthouse metrics with a performance gauge and score comparison chart.',
    build: () => cloneDoc(PERFORMANCE),
  },
  {
    id: 'seo-quality',
    name: 'SEO & quality',
    tagline: 'Images, links & a11y',
    description: 'Image SEO, broken links, largest assets, and accessibility violations.',
    build: () => cloneDoc(SEO_QUALITY),
  },
  {
    id: 'geo-aeo',
    name: 'GEO / AEO readiness',
    tagline: 'AI & agent discoverability',
    description: 'GEO readiness, agent citability, E-E-A-T, and sub-score breakdowns.',
    build: () => cloneDoc(GEO_AEO),
  },
  {
    id: 'search-console',
    name: 'Search Console',
    tagline: 'Clicks, impressions & CTR',
    description: 'Google Search Console summary when GSC is connected.',
    build: () => cloneDoc(SEARCH_CONSOLE),
  },
];

/** Fresh widget IDs on each build so presets can be applied multiple times. */
function cloneDoc(source: DashboardDoc): DashboardDoc {
  return {
    version: 1,
    widgets: source.widgets.map((w) => ({ ...w, id: newWidgetId() })),
  };
}

export function getDashboardPreset(id: string): DashboardPreset | undefined {
  return DASHBOARD_PRESETS.find((p) => p.id === id);
}
