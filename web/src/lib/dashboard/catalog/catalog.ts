import type { VizType } from '@/lib/dashboard/types';
import type { AggregateOp } from '@/lib/dashboard/types';

export type FieldRole = 'dimension' | 'measure';

export interface CatalogField {
  /** Dot-path key, e.g. 'crawl_summary.count_4xx'. */
  key: string;
  /** Human-readable label shown in pickers. */
  label: string;
  /** 'dimension' = categorical (group-by / X axis); 'measure' = numeric (Y axis / KPI). */
  role: FieldRole;
  /** Default aggregation for measure fields when aggregating rows. */
  defaultAgg?: AggregateOp;
  /** Suggested number format string (same tokens as WidgetOptions.format). */
  format?: string;
}

export interface CatalogEntry {
  toolName: string;
  label: string;
  section: string;
  description: string;
  defaultArgs?: Record<string, unknown>;
  /** Dot-path into the tool result that contains the rows array. */
  rowsPath?: string;
  fields: CatalogField[];
  compatibleViz: VizType[];
}

// ─── helpers ───────────────────────────────────────────────────────────────

export function dimensions(e: CatalogEntry): CatalogField[] {
  return e.fields.filter((f) => f.role === 'dimension');
}

export function measures(e: CatalogEntry): CatalogField[] {
  return e.fields.filter((f) => f.role === 'measure');
}

export function fieldKeys(e: CatalogEntry): string[] {
  return e.fields.map((f) => f.key);
}

/** First dimension key, used as default X / series-split field. */
export function defaultDimension(e: CatalogEntry): string | undefined {
  return dimensions(e)[0]?.key;
}

/** First measure key, used as default Y / KPI value field. */
export function defaultMeasure(e: CatalogEntry): string | undefined {
  return measures(e)[0]?.key;
}

// ─── shorthand arrays ───────────────────────────────────────────────────────

const CHART_VIZ: VizType[] = ['bar', 'horizontal-bar', 'ranked-bar', 'line', 'area', 'pie', 'doughnut', 'stacked-bar', 'table'];
const METRIC_VIZ: VizType[] = ['kpi', 'stat-card', 'gauge', 'sparkline'];

// ─── catalog ────────────────────────────────────────────────────────────────

export const DASHBOARD_CATALOG: CatalogEntry[] = [
  {
    toolName: 'get_report_summary',
    label: 'Audit summary',
    section: 'Overview',
    description: 'Top-level health score and page counts from the latest audit.',
    fields: [
      { key: 'health_score', label: 'Health score', role: 'measure', defaultAgg: 'avg', format: '0' },
      { key: 'total_issues', label: 'Total issues', role: 'measure', defaultAgg: 'sum' },
      { key: 'crawl_summary.total_urls', label: 'Total URLs', role: 'measure', defaultAgg: 'sum' },
      { key: 'crawl_summary.count_2xx', label: '2xx URLs', role: 'measure', defaultAgg: 'sum' },
      { key: 'crawl_summary.count_4xx', label: '4xx URLs', role: 'measure', defaultAgg: 'sum' },
      { key: 'crawl_summary.count_5xx', label: '5xx URLs', role: 'measure', defaultAgg: 'sum' },
    ],
    compatibleViz: [...METRIC_VIZ, 'stacked-bar'],
  },
  {
    toolName: 'get_category_scores',
    label: 'Category scores',
    section: 'Overview',
    description: 'Score per audit category (SEO, performance, security, etc.).',
    rowsPath: 'categories',
    fields: [
      { key: 'name', label: 'Category', role: 'dimension' },
      { key: 'score', label: 'Score', role: 'measure', defaultAgg: 'avg', format: '0' },
      { key: 'issue_count', label: 'Issue count', role: 'measure', defaultAgg: 'sum' },
    ],
    compatibleViz: [...CHART_VIZ, 'stat-card'],
  },
  {
    toolName: 'get_critical_issues',
    label: 'Critical issues',
    section: 'Overview',
    description: 'Most impactful issues found in the audit.',
    rowsPath: 'issues',
    defaultArgs: { limit: 20 },
    fields: [
      { key: 'message', label: 'Message', role: 'dimension' },
      { key: 'category', label: 'Category', role: 'dimension' },
      { key: 'priority', label: 'Priority', role: 'dimension' },
      { key: 'url', label: 'URL', role: 'dimension' },
      { key: 'impact_score', label: 'Impact score', role: 'measure', defaultAgg: 'avg' },
    ],
    compatibleViz: ['table', 'bar', 'horizontal-bar', 'ranked-bar'],
  },
  {
    toolName: 'get_lighthouse_summary',
    label: 'Lighthouse summary',
    section: 'Performance',
    description: 'Aggregate Lighthouse scores: performance, accessibility, SEO.',
    fields: [
      { key: 'summary.category_scores.performance', label: 'Performance', role: 'measure', defaultAgg: 'avg', format: 'pct' },
      { key: 'summary.category_scores.accessibility', label: 'Accessibility', role: 'measure', defaultAgg: 'avg', format: 'pct' },
      { key: 'summary.category_scores.seo', label: 'SEO', role: 'measure', defaultAgg: 'avg', format: 'pct' },
      { key: 'pages_audited', label: 'Pages audited', role: 'measure', defaultAgg: 'sum' },
    ],
    compatibleViz: [...METRIC_VIZ],
  },
  {
    toolName: 'list_broken_links',
    label: 'Broken links',
    section: 'Links',
    description: 'Pages returning 4xx/5xx or error status codes.',
    rowsPath: 'broken',
    defaultArgs: { limit: 50 },
    fields: [
      { key: 'url', label: 'URL', role: 'dimension' },
      { key: 'status', label: 'Status code', role: 'dimension' },
    ],
    compatibleViz: ['table'],
  },
  {
    toolName: 'get_image_audit_summary',
    label: 'Image SEO summary',
    section: 'Images',
    description: 'Overview of image alt text, dimensions, lazy-loading, and counts.',
    fields: [
      { key: 'pages_missing_alt', label: 'Pages missing alt', role: 'measure', defaultAgg: 'sum' },
      { key: 'images_total_crawled', label: 'Images crawled', role: 'measure', defaultAgg: 'sum' },
      { key: 'pages_missing_image_dimensions', label: 'Missing dimensions', role: 'measure', defaultAgg: 'sum' },
      { key: 'pages_without_lazy_images', label: 'No lazy-load', role: 'measure', defaultAgg: 'sum' },
      { key: 'og_image_missing_count', label: 'Missing OG image', role: 'measure', defaultAgg: 'sum' },
    ],
    compatibleViz: [...METRIC_VIZ, 'bar', 'horizontal-bar', 'stacked-bar', 'pie', 'doughnut'],
  },
  {
    toolName: 'list_largest_images',
    label: 'Largest images',
    section: 'Images',
    description: 'Images sorted by file size — largest first.',
    rowsPath: 'items',
    defaultArgs: { limit: 20 },
    fields: [
      { key: 'url', label: 'URL', role: 'dimension' },
      { key: 'content_type', label: 'Content type', role: 'dimension' },
      { key: 'size_bytes', label: 'Size (bytes)', role: 'measure', defaultAgg: 'sum' },
    ],
    compatibleViz: ['table', 'bar', 'horizontal-bar', 'ranked-bar'],
  },
  {
    toolName: 'get_axe_audit_summary',
    label: 'Accessibility summary',
    section: 'Accessibility',
    description: 'Pages with axe accessibility violations.',
    fields: [
      { key: 'pages_with_violations', label: 'Pages with violations', role: 'measure', defaultAgg: 'sum' },
      { key: 'total_violations', label: 'Total violations', role: 'measure', defaultAgg: 'sum' },
    ],
    compatibleViz: [...METRIC_VIZ, 'stacked-bar', 'bar'],
  },
  {
    toolName: 'get_geo_readiness_score',
    label: 'GEO readiness score',
    section: 'GEO / AEO',
    description: 'AI answer-engine readiness score and sub-scores.',
    fields: [
      { key: 'band', label: 'Band', role: 'dimension' },
      { key: 'geo_readiness_score', label: 'GEO readiness', role: 'measure', defaultAgg: 'avg', format: '0' },
      { key: 'components.schema_coverage', label: 'Schema coverage', role: 'measure', defaultAgg: 'avg', format: 'pct' },
      { key: 'components.faq_schema_coverage', label: 'FAQ schema', role: 'measure', defaultAgg: 'avg', format: 'pct' },
      { key: 'components.robots_ai_access', label: 'Robots AI access', role: 'measure', defaultAgg: 'avg' },
      { key: 'components.meta_tags', label: 'Meta tags', role: 'measure', defaultAgg: 'avg' },
    ],
    compatibleViz: [...METRIC_VIZ],
  },
  {
    toolName: 'get_agent_readiness_score',
    label: 'Agent readiness score',
    section: 'GEO / AEO',
    description: 'Score for agent/MCP discoverability.',
    fields: [
      { key: 'grade', label: 'Grade', role: 'dimension' },
      { key: 'agent_readiness_score', label: 'Agent readiness', role: 'measure', defaultAgg: 'avg', format: '0' },
      { key: 'percentage', label: 'Percentage', role: 'measure', defaultAgg: 'avg', format: 'pct' },
    ],
    compatibleViz: [...METRIC_VIZ],
  },
  {
    toolName: 'get_citability_score',
    label: 'Citability score',
    section: 'GEO / AEO',
    description: 'Measures how likely LLMs are to cite pages on this site.',
    fields: [
      { key: 'citability_score', label: 'Citability score', role: 'measure', defaultAgg: 'avg', format: '0' },
      { key: 'total_pages', label: 'Total pages', role: 'measure', defaultAgg: 'sum' },
      { key: 'pages_above_50', label: 'Pages above 50', role: 'measure', defaultAgg: 'sum' },
      { key: 'pages_above_75', label: 'Pages above 75', role: 'measure', defaultAgg: 'sum' },
    ],
    compatibleViz: [...METRIC_VIZ, 'stacked-bar', 'pie'],
  },
  {
    toolName: 'get_eeat_signals_summary',
    label: 'E-E-A-T signals',
    section: 'GEO / AEO',
    description: 'Author, organization, and about/contact page signals from the crawl.',
    fields: [
      { key: 'pages_with_author_schema', label: 'Author schema', role: 'measure', defaultAgg: 'sum' },
      { key: 'pages_with_organization_schema', label: 'Org schema', role: 'measure', defaultAgg: 'sum' },
      { key: 'about_contact_pages', label: 'About/contact pages', role: 'measure', defaultAgg: 'sum' },
    ],
    compatibleViz: [...METRIC_VIZ, 'bar', 'stacked-bar'],
  },
  {
    toolName: 'get_google_summary',
    label: 'Google Search Console summary',
    section: 'Search',
    description: 'Clicks, impressions, CTR, and average position from GSC.',
    fields: [
      { key: 'gsc.summary.clicks', label: 'Clicks', role: 'measure', defaultAgg: 'sum' },
      { key: 'gsc.summary.impressions', label: 'Impressions', role: 'measure', defaultAgg: 'sum' },
      { key: 'gsc.summary.ctr', label: 'CTR', role: 'measure', defaultAgg: 'avg', format: '0.0%' },
      { key: 'gsc.summary.position', label: 'Avg position', role: 'measure', defaultAgg: 'avg', format: '0.0' },
    ],
    compatibleViz: [...METRIC_VIZ, 'bar', 'horizontal-bar', 'stacked-bar', 'line'],
  },
];

// ─── lookup utilities ───────────────────────────────────────────────────────

export function catalogBySectionSections(): string[] {
  return [...new Set(DASHBOARD_CATALOG.map((e) => e.section))];
}

export function catalogBySection(): Record<string, CatalogEntry[]> {
  const out: Record<string, CatalogEntry[]> = {};
  for (const entry of DASHBOARD_CATALOG) {
    if (!out[entry.section]) out[entry.section] = [];
    out[entry.section].push(entry);
  }
  return out;
}

export function catalogEntry(toolName: string): CatalogEntry | undefined {
  return DASHBOARD_CATALOG.find((e) => e.toolName === toolName);
}
