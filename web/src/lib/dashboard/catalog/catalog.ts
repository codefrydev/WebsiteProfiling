import type { VizType } from '@/lib/dashboard/types';

export interface CatalogEntry {
  toolName: string;
  label: string;
  section: string;
  description: string;
  defaultArgs?: Record<string, unknown>;
  fields?: string[];
  rowsPath?: string;
  compatibleViz: VizType[];
  defaultValueField?: string;
  defaultXField?: string;
  defaultYField?: string;
}

const CHART_VIZ: VizType[] = ['bar', 'horizontal-bar', 'ranked-bar', 'line', 'area', 'pie', 'doughnut', 'stacked-bar', 'table'];
const METRIC_VIZ: VizType[] = ['kpi', 'stat-card', 'gauge', 'sparkline'];

export const DASHBOARD_CATALOG: CatalogEntry[] = [
  {
    toolName: 'get_report_summary',
    label: 'Audit summary',
    section: 'Overview',
    description: 'Top-level health score and page counts from the latest audit.',
    fields: ['health_score', 'total_issues', 'crawl_summary.total_urls', 'crawl_summary.count_2xx', 'crawl_summary.count_4xx', 'crawl_summary.count_5xx'],
    compatibleViz: [...METRIC_VIZ, 'stacked-bar'],
    defaultValueField: 'health_score',
  },
  {
    toolName: 'get_category_scores',
    label: 'Category scores',
    section: 'Overview',
    description: 'Score per audit category (SEO, performance, security, etc.).',
    fields: ['name', 'score', 'issue_count'],
    rowsPath: 'categories',
    defaultXField: 'name',
    defaultYField: 'score',
    compatibleViz: [...CHART_VIZ, 'stat-card'],
  },
  {
    toolName: 'get_critical_issues',
    label: 'Critical issues',
    section: 'Overview',
    description: 'Most impactful issues found in the audit.',
    fields: ['message', 'priority', 'category', 'url', 'impact_score'],
    rowsPath: 'issues',
    defaultXField: 'message',
    defaultYField: 'impact_score',
    compatibleViz: ['table', 'bar', 'horizontal-bar', 'ranked-bar'],
    defaultArgs: { limit: 20 },
  },
  {
    toolName: 'get_lighthouse_summary',
    label: 'Lighthouse summary',
    section: 'Performance',
    description: 'Aggregate Lighthouse scores: performance, accessibility, SEO.',
    fields: ['summary.category_scores.performance', 'summary.category_scores.accessibility', 'summary.category_scores.seo', 'pages_audited'],
    compatibleViz: [...METRIC_VIZ],
    defaultValueField: 'summary.category_scores.performance',
  },
  {
    toolName: 'list_broken_links',
    label: 'Broken links',
    section: 'Links',
    description: 'Pages returning 4xx/5xx or error status codes.',
    fields: ['url', 'status'],
    rowsPath: 'broken',
    defaultXField: 'url',
    defaultYField: 'status',
    compatibleViz: ['table'],
    defaultArgs: { limit: 50 },
  },
  {
    toolName: 'get_image_audit_summary',
    label: 'Image SEO summary',
    section: 'Images',
    description: 'Overview of image alt text, dimensions, lazy-loading, and counts.',
    fields: ['pages_missing_alt', 'images_total_crawled', 'pages_missing_image_dimensions', 'pages_without_lazy_images', 'og_image_missing_count'],
    compatibleViz: [...METRIC_VIZ, 'bar', 'horizontal-bar', 'stacked-bar', 'pie', 'doughnut'],
    defaultValueField: 'pages_missing_alt',
  },
  {
    toolName: 'list_largest_images',
    label: 'Largest images',
    section: 'Images',
    description: 'Images sorted by file size — largest first (requires image inventory probe).',
    fields: ['url', 'size_bytes', 'content_type'],
    rowsPath: 'items',
    defaultXField: 'url',
    defaultYField: 'size_bytes',
    compatibleViz: ['table', 'bar', 'horizontal-bar', 'ranked-bar'],
    defaultArgs: { limit: 20 },
  },
  {
    toolName: 'get_axe_audit_summary',
    label: 'Accessibility summary',
    section: 'Accessibility',
    description: 'Pages with axe accessibility violations.',
    fields: ['pages_with_violations', 'total_violations'],
    compatibleViz: [...METRIC_VIZ, 'stacked-bar', 'bar'],
    defaultValueField: 'total_violations',
  },
  {
    toolName: 'get_geo_readiness_score',
    label: 'GEO readiness score',
    section: 'GEO / AEO',
    description: 'AI answer-engine readiness score and sub-scores.',
    fields: ['geo_readiness_score', 'band', 'components.schema_coverage', 'components.faq_schema_coverage', 'components.robots_ai_access', 'components.meta_tags'],
    compatibleViz: [...METRIC_VIZ],
    defaultValueField: 'geo_readiness_score',
  },
  {
    toolName: 'get_agent_readiness_score',
    label: 'Agent readiness score',
    section: 'GEO / AEO',
    description: 'Score for agent/MCP discoverability.',
    fields: ['agent_readiness_score', 'percentage', 'grade'],
    compatibleViz: [...METRIC_VIZ],
    defaultValueField: 'agent_readiness_score',
  },
  {
    toolName: 'get_citability_score',
    label: 'Citability score',
    section: 'GEO / AEO',
    description: 'Measures how likely LLMs are to cite pages on this site.',
    fields: ['citability_score', 'total_pages', 'pages_above_50', 'pages_above_75'],
    compatibleViz: [...METRIC_VIZ, 'stacked-bar', 'pie'],
    defaultValueField: 'citability_score',
  },
  {
    toolName: 'get_eeat_signals_summary',
    label: 'E-E-A-T signals',
    section: 'GEO / AEO',
    description: 'Author, organization, and about/contact page signals from the crawl.',
    fields: ['pages_with_author_schema', 'pages_with_organization_schema', 'about_contact_pages'],
    compatibleViz: [...METRIC_VIZ, 'bar', 'stacked-bar'],
    defaultValueField: 'pages_with_author_schema',
  },
  {
    toolName: 'get_google_summary',
    label: 'Google Search Console summary',
    section: 'Search',
    description: 'Clicks, impressions, CTR, and average position from GSC.',
    fields: ['gsc.summary.clicks', 'gsc.summary.impressions', 'gsc.summary.ctr', 'gsc.summary.position'],
    compatibleViz: [...METRIC_VIZ, 'bar', 'horizontal-bar', 'stacked-bar', 'line'],
    defaultValueField: 'gsc.summary.clicks',
  },
];

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
