/**
 * Dataset registry: declarative projections of the report payload into rows +
 * a curated dimension/measure field catalog. This is the "data source" list the
 * builder shows; the query engine runs against `accessor(payload)` rows.
 */
import type { ReportPayload, ReportCategory, LighthousePageSummary } from '@/types/report';
import type { DatasetDef, VizType } from '@/lib/dashboard/engine/types';
import {
  fromParallel,
  fromMap,
  flattenCategoryIssues,
  flattenLighthouseByUrl,
  flatPrefix,
} from '@/lib/dashboard/engine/accessors';

const METRIC: VizType[] = ['kpi', 'stat-card', 'gauge', 'sparkline'];
const CATEGORICAL: VizType[] = [
  'bar', 'horizontal-bar', 'stacked-bar', 'pie', 'doughnut', 'treemap', 'funnel', 'table',
];
const RANKED: VizType[] = ['bar', 'horizontal-bar', 'table', 'treemap', 'funnel'];
const TIME: VizType[] = ['line', 'area', 'bar', 'table', 'sparkline'];

function arr(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
}

/** Split a URL into host / path / first path segment for drill + grouping. */
function urlParts(u: unknown): { host: string; path: string; path_segment: string } {
  const s = String(u ?? '');
  try {
    const x = new URL(s);
    const seg = x.pathname.split('/').filter(Boolean)[0] ?? '/';
    return { host: x.host, path: x.pathname || '/', path_segment: `/${seg}` };
  } catch {
    return { host: '', path: s, path_segment: s };
  }
}

export const DATASETS: DatasetDef[] = [
  // ── Overview / core ───────────────────────────────────────────────────────
  {
    id: 'summary',
    label: 'Site summary (KPIs)',
    group: 'Overview',
    section: 'core',
    description: 'Scalar headline metrics: crawl totals, SEO health, search & Lighthouse summaries.',
    preAggregated: true,
    accessor: (d) => [
      {
        ...(d.summary ?? {}),
        ...flatPrefix('seo_health', d.seo_health as Record<string, unknown> | undefined),
        ...flatPrefix('gsc', d.google?.gsc?.summary as Record<string, unknown> | undefined),
        ...flatPrefix('ga4', d.google?.ga4?.summary as Record<string, unknown> | undefined),
        ...flatPrefix('lh', d.lighthouse_summary?.median_metrics as Record<string, unknown> | undefined),
        ...flatPrefix('social', d.social_coverage as Record<string, unknown> | undefined),
        health_score: d.portfolio_benchmark?.property_health_score ?? null,
      },
    ],
    fields: [
      { key: 'health_score', label: 'Health score', role: 'measure', defaultAgg: 'max', format: 'score' },
      { key: 'total_urls', label: 'Total URLs', role: 'measure', defaultAgg: 'max', format: '0' },
      { key: 'success_rate', label: 'Success rate', role: 'measure', defaultAgg: 'max', format: 'pct' },
      { key: 'count_2xx', label: '2xx pages', role: 'measure', defaultAgg: 'max', format: '0' },
      { key: 'count_3xx', label: '3xx pages', role: 'measure', defaultAgg: 'max', format: '0' },
      { key: 'count_4xx', label: '4xx pages', role: 'measure', defaultAgg: 'max', format: '0' },
      { key: 'count_5xx', label: '5xx pages', role: 'measure', defaultAgg: 'max', format: '0' },
      { key: 'avg_outlinks', label: 'Avg outlinks', role: 'measure', defaultAgg: 'max', format: '0.0' },
      { key: 'seo_health.missing_title', label: 'Missing titles', role: 'measure', defaultAgg: 'max', format: '0' },
      { key: 'seo_health.missing_meta_desc', label: 'Missing meta desc', role: 'measure', defaultAgg: 'max', format: '0' },
      { key: 'seo_health.thin_content', label: 'Thin content pages', role: 'measure', defaultAgg: 'max', format: '0' },
      { key: 'gsc.clicks', label: 'GSC clicks', role: 'measure', defaultAgg: 'max', format: '0' },
      { key: 'gsc.impressions', label: 'GSC impressions', role: 'measure', defaultAgg: 'max', format: '0' },
      { key: 'gsc.ctr', label: 'GSC CTR', role: 'measure', defaultAgg: 'max', format: '0.0%' },
      { key: 'gsc.position', label: 'GSC avg position', role: 'measure', defaultAgg: 'max', format: '0.0' },
      { key: 'ga4.sessions', label: 'GA4 sessions', role: 'measure', defaultAgg: 'max', format: '0' },
      { key: 'ga4.activeUsers', label: 'GA4 users', role: 'measure', defaultAgg: 'max', format: '0' },
      { key: 'lh.performance_score', label: 'Lighthouse perf', role: 'measure', defaultAgg: 'max', format: 'score' },
      { key: 'lh.seo_score', label: 'Lighthouse SEO', role: 'measure', defaultAgg: 'max', format: 'score' },
      { key: 'social.og_coverage_pct', label: 'OG coverage', role: 'measure', defaultAgg: 'max', format: 'pct' },
    ],
    viz: [...METRIC],
    defaultSpec: { measures: [{ field: 'health_score', agg: 'max', label: 'Health score', format: 'score' }] },
  },
  {
    id: 'categories',
    label: 'Category scores',
    group: 'Overview',
    section: 'core',
    description: 'Audit score and issue count per category (Technical SEO, Performance, …).',
    preAggregated: true,
    accessor: (d) =>
      ((d.categories as ReportCategory[] | undefined) ?? []).map((c) => ({
        id: c.id ?? '',
        name: c.name ?? c.id ?? '',
        score: c.score ?? null,
        issue_count: Array.isArray(c.issues) ? c.issues.length : 0,
      })),
    fields: [
      { key: 'name', label: 'Category', role: 'dimension' },
      { key: 'score', label: 'Score', role: 'measure', defaultAgg: 'avg', format: 'score' },
      { key: 'issue_count', label: 'Issue count', role: 'measure', defaultAgg: 'sum', format: '0' },
    ],
    viz: [...CATEGORICAL, 'radar'],
    defaultSpec: {
      groupBy: 'name',
      measures: [{ field: 'score', agg: 'avg', label: 'Score', format: 'score' }],
      sort: { by: 'Score', dir: 'desc' },
    },
  },
  {
    id: 'issues',
    label: 'Issues',
    group: 'Overview',
    section: 'core',
    description: 'Every audit issue flattened across categories (priority, impact, traffic at risk).',
    accessor: (d) => flattenCategoryIssues(d.categories as ReportCategory[] | undefined),
    fields: [
      { key: 'category', label: 'Category', role: 'dimension' },
      { key: 'priority', label: 'Priority', role: 'dimension' },
      { key: 'type', label: 'Type', role: 'dimension' },
      { key: 'message', label: 'Message', role: 'dimension' },
      { key: 'url', label: 'URL', role: 'dimension' },
      { key: 'impact_score', label: 'Impact score', role: 'measure', defaultAgg: 'avg', format: '0.0' },
      { key: 'gsc_clicks', label: 'GSC clicks', role: 'measure', defaultAgg: 'sum', format: '0' },
      { key: 'gsc_impressions', label: 'GSC impressions', role: 'measure', defaultAgg: 'sum', format: '0' },
      { key: 'ga4_sessions', label: 'GA4 sessions', role: 'measure', defaultAgg: 'sum', format: '0' },
    ],
    viz: [...CATEGORICAL, 'kpi', 'stat-card'],
    defaultSpec: {
      groupBy: 'category',
      measures: [{ field: 'message', agg: 'count', label: 'Issues' }],
      sort: { by: 'Issues', dir: 'desc' },
    },
  },
  {
    id: 'status_counts',
    label: 'Status code distribution',
    group: 'Overview',
    section: 'core',
    description: 'Pages per HTTP status code.',
    preAggregated: true,
    accessor: (d) => fromMap(d.status_counts as Record<string, unknown> | undefined),
    fields: [
      { key: 'label', label: 'Status code', role: 'dimension' },
      { key: 'value', label: 'Pages', role: 'measure', defaultAgg: 'sum', format: '0' },
    ],
    viz: [...CATEGORICAL, 'kpi'],
    defaultSpec: { groupBy: 'label', measures: [{ field: 'value', agg: 'sum', label: 'Pages' }] },
  },

  // ── Crawl / links ──────────────────────────────────────────────────────────
  {
    id: 'links',
    label: 'Pages (crawl)',
    group: 'Crawl',
    section: 'links',
    description: 'One row per crawled URL — the main detail table. Group by status, depth, host…',
    accessor: (d) =>
      arr(d.links).map((l) => ({ ...l, ...urlParts(l.url) })),
    fields: [
      { key: 'url', label: 'URL', role: 'dimension' },
      { key: 'host', label: 'Host', role: 'dimension' },
      { key: 'path', label: 'Path', role: 'dimension' },
      { key: 'path_segment', label: 'Section', role: 'dimension' },
      { key: 'status', label: 'Status', role: 'dimension' },
      { key: 'depth', label: 'Depth', role: 'dimension' },
      { key: 'content_type', label: 'Content type', role: 'dimension' },
      { key: 'title', label: 'Title', role: 'dimension' },
      { key: 'word_count', label: 'Word count', role: 'measure', defaultAgg: 'avg', format: '0' },
      { key: 'inlinks', label: 'Inlinks', role: 'measure', defaultAgg: 'sum', format: '0' },
      { key: 'outlinks', label: 'Outlinks', role: 'measure', defaultAgg: 'sum', format: '0' },
      { key: 'response_time_ms', label: 'Response time (ms)', role: 'measure', defaultAgg: 'avg', format: '0' },
      { key: 'pagerank', label: 'PageRank', role: 'measure', defaultAgg: 'avg', format: '0.00' },
      { key: 'images_total', label: 'Images', role: 'measure', defaultAgg: 'sum', format: '0' },
      { key: 'images_without_alt', label: 'Images w/o alt', role: 'measure', defaultAgg: 'sum', format: '0' },
    ],
    viz: ['table', 'bar', 'horizontal-bar', 'stacked-bar', 'pie', 'doughnut', 'line', 'scatter', 'kpi', 'stat-card'],
    defaultSpec: {
      groupBy: 'status',
      measures: [{ field: 'url', agg: 'count', label: 'Pages' }],
      sort: { by: 'Pages', dir: 'desc' },
    },
  },
  {
    id: 'outbound_link_domains',
    label: 'Outbound link domains',
    group: 'Crawl',
    section: 'links',
    description: 'External domains linked from the site, by link/page count.',
    preAggregated: true,
    accessor: (d) => arr(d.outbound_link_domains),
    fields: [
      { key: 'host', label: 'Domain', role: 'dimension' },
      { key: 'link_count', label: 'Links', role: 'measure', defaultAgg: 'sum', format: '0' },
      { key: 'page_count', label: 'Pages', role: 'measure', defaultAgg: 'sum', format: '0' },
    ],
    viz: [...RANKED],
    defaultSpec: {
      groupBy: 'host',
      measures: [{ field: 'link_count', agg: 'sum', label: 'Links' }],
      sort: { by: 'Links', dir: 'desc' },
      topN: { n: 15, other: true },
    },
  },

  // ── Search Console / Analytics ─────────────────────────────────────────────
  {
    id: 'gsc_top_queries',
    label: 'GSC — top queries',
    group: 'Search Console',
    section: 'traffic',
    description: 'Search queries by clicks, impressions, CTR, position.',
    preAggregated: true,
    accessor: (d) => arr(d.google?.gsc?.top_queries),
    fields: [
      { key: 'query', label: 'Query', role: 'dimension' },
      { key: 'clicks', label: 'Clicks', role: 'measure', defaultAgg: 'sum', format: '0' },
      { key: 'impressions', label: 'Impressions', role: 'measure', defaultAgg: 'sum', format: '0' },
      { key: 'ctr', label: 'CTR', role: 'measure', defaultAgg: 'avg', format: '0.0%' },
      { key: 'position', label: 'Avg position', role: 'measure', defaultAgg: 'avg', format: '0.0' },
    ],
    viz: [...RANKED, 'kpi'],
    defaultSpec: {
      groupBy: 'query',
      measures: [{ field: 'clicks', agg: 'sum', label: 'Clicks' }],
      sort: { by: 'Clicks', dir: 'desc' },
      topN: { n: 10 },
    },
  },
  {
    id: 'gsc_top_pages',
    label: 'GSC — top pages',
    group: 'Search Console',
    section: 'traffic',
    description: 'Landing pages by clicks, impressions, CTR, position.',
    preAggregated: true,
    accessor: (d) => arr(d.google?.gsc?.top_pages),
    fields: [
      { key: 'page', label: 'Page', role: 'dimension' },
      { key: 'clicks', label: 'Clicks', role: 'measure', defaultAgg: 'sum', format: '0' },
      { key: 'impressions', label: 'Impressions', role: 'measure', defaultAgg: 'sum', format: '0' },
      { key: 'ctr', label: 'CTR', role: 'measure', defaultAgg: 'avg', format: '0.0%' },
      { key: 'position', label: 'Avg position', role: 'measure', defaultAgg: 'avg', format: '0.0' },
    ],
    viz: [...RANKED, 'kpi'],
    defaultSpec: {
      groupBy: 'page',
      measures: [{ field: 'clicks', agg: 'sum', label: 'Clicks' }],
      sort: { by: 'Clicks', dir: 'desc' },
      topN: { n: 10 },
    },
  },
  {
    id: 'gsc_daily',
    label: 'GSC — daily trend',
    group: 'Search Console',
    section: 'traffic',
    description: 'Clicks & impressions per day.',
    preAggregated: true,
    accessor: (d) => arr(d.google?.gsc?.daily),
    fields: [
      { key: 'date', label: 'Date', role: 'dimension', isDate: true },
      { key: 'clicks', label: 'Clicks', role: 'measure', defaultAgg: 'sum', format: '0' },
      { key: 'impressions', label: 'Impressions', role: 'measure', defaultAgg: 'sum', format: '0' },
    ],
    viz: [...TIME],
    defaultSpec: {
      groupBy: 'date',
      measures: [{ field: 'clicks', agg: 'sum', label: 'Clicks' }],
      sort: { by: 'category', dir: 'asc' },
    },
  },
  {
    id: 'ga4_top_pages',
    label: 'GA4 — top pages',
    group: 'Analytics',
    section: 'traffic',
    description: 'Most-viewed pages by sessions, users, views.',
    preAggregated: true,
    accessor: (d) => arr(d.google?.ga4?.top_pages),
    fields: [
      { key: 'path', label: 'Path', role: 'dimension' },
      { key: 'sessions', label: 'Sessions', role: 'measure', defaultAgg: 'sum', format: '0' },
      { key: 'activeUsers', label: 'Users', role: 'measure', defaultAgg: 'sum', format: '0' },
      { key: 'screenPageViews', label: 'Views', role: 'measure', defaultAgg: 'sum', format: '0' },
      { key: 'engagementRate', label: 'Engagement rate', role: 'measure', defaultAgg: 'avg', format: '0.0%' },
    ],
    viz: [...RANKED, 'kpi'],
    defaultSpec: {
      groupBy: 'path',
      measures: [{ field: 'sessions', agg: 'sum', label: 'Sessions' }],
      sort: { by: 'Sessions', dir: 'desc' },
      topN: { n: 10 },
    },
  },
  {
    id: 'ga4_by_channel',
    label: 'GA4 — by channel',
    group: 'Analytics',
    section: 'traffic',
    description: 'Sessions by acquisition channel.',
    preAggregated: true,
    accessor: (d) => arr(d.google?.ga4?.by_channel),
    fields: [
      { key: 'channel', label: 'Channel', role: 'dimension' },
      { key: 'sessions', label: 'Sessions', role: 'measure', defaultAgg: 'sum', format: '0' },
    ],
    viz: [...CATEGORICAL],
    defaultSpec: { groupBy: 'channel', measures: [{ field: 'sessions', agg: 'sum', label: 'Sessions' }], sort: { by: 'Sessions', dir: 'desc' } },
  },
  {
    id: 'ga4_by_device',
    label: 'GA4 — by device',
    group: 'Analytics',
    section: 'traffic',
    description: 'Sessions by device category.',
    preAggregated: true,
    accessor: (d) => arr(d.google?.ga4?.by_device),
    fields: [
      { key: 'device', label: 'Device', role: 'dimension' },
      { key: 'sessions', label: 'Sessions', role: 'measure', defaultAgg: 'sum', format: '0' },
    ],
    viz: ['pie', 'doughnut', 'bar', 'horizontal-bar', 'table'],
    defaultSpec: { groupBy: 'device', measures: [{ field: 'sessions', agg: 'sum', label: 'Sessions' }] },
  },

  // ── Keywords ───────────────────────────────────────────────────────────────
  {
    id: 'keywords',
    label: 'Keywords',
    group: 'Keywords',
    section: 'keywords',
    description: 'Keyword research rows: intent, difficulty, GSC metrics, opportunity.',
    accessor: (d) => arr(d.keywords?.rows),
    fields: [
      { key: 'keyword', label: 'Keyword', role: 'dimension' },
      { key: 'intent', label: 'Intent', role: 'dimension' },
      { key: 'parent_topic', label: 'Topic', role: 'dimension' },
      { key: 'trend', label: 'Trend', role: 'dimension' },
      { key: 'difficulty', label: 'Difficulty', role: 'measure', defaultAgg: 'avg', format: '0' },
      { key: 'gsc_clicks', label: 'Clicks', role: 'measure', defaultAgg: 'sum', format: '0' },
      { key: 'gsc_impressions', label: 'Impressions', role: 'measure', defaultAgg: 'sum', format: '0' },
      { key: 'gsc_position', label: 'Position', role: 'measure', defaultAgg: 'avg', format: '0.0' },
      { key: 'traffic_potential', label: 'Traffic potential', role: 'measure', defaultAgg: 'sum', format: '0' },
    ],
    viz: ['table', 'bar', 'horizontal-bar', 'pie', 'doughnut', 'scatter', 'kpi'],
    defaultSpec: {
      groupBy: 'intent',
      measures: [{ field: 'keyword', agg: 'count', label: 'Keywords' }],
      sort: { by: 'Keywords', dir: 'desc' },
    },
  },

  // ── Backlinks ──────────────────────────────────────────────────────────────
  {
    id: 'gsc_top_linking_sites',
    label: 'Top linking sites',
    group: 'Backlinks',
    section: 'gsc-links',
    description: 'Referring domains by link & target-page count.',
    preAggregated: true,
    accessor: (d) => arr(d.gsc_links?.top_linking_sites),
    fields: [
      { key: 'site', label: 'Site', role: 'dimension' },
      { key: 'link_count', label: 'Links', role: 'measure', defaultAgg: 'sum', format: '0' },
      { key: 'target_page_count', label: 'Target pages', role: 'measure', defaultAgg: 'sum', format: '0' },
    ],
    viz: [...RANKED],
    defaultSpec: {
      groupBy: 'site',
      measures: [{ field: 'link_count', agg: 'sum', label: 'Links' }],
      sort: { by: 'Links', dir: 'desc' },
      topN: { n: 15, other: true },
    },
  },

  // ── Lighthouse ─────────────────────────────────────────────────────────────
  {
    id: 'lighthouse_by_url',
    label: 'Lighthouse by page',
    group: 'Performance',
    section: 'lighthouse',
    description: 'Per-URL Lighthouse scores and Core Web Vitals.',
    accessor: (d) =>
      flattenLighthouseByUrl(d.lighthouse_by_url as Record<string, LighthousePageSummary> | undefined),
    fields: [
      { key: 'url', label: 'URL', role: 'dimension' },
      { key: 'strategy', label: 'Strategy', role: 'dimension' },
      { key: 'performance_score', label: 'Performance', role: 'measure', defaultAgg: 'avg', format: '0.0' },
      { key: 'accessibility_score', label: 'Accessibility', role: 'measure', defaultAgg: 'avg', format: '0.0' },
      { key: 'seo_score', label: 'SEO', role: 'measure', defaultAgg: 'avg', format: '0.0' },
      { key: 'best_practices_score', label: 'Best practices', role: 'measure', defaultAgg: 'avg', format: '0.0' },
      { key: 'lcp_ms', label: 'LCP (ms)', role: 'measure', defaultAgg: 'avg', format: '0' },
      { key: 'cls', label: 'CLS', role: 'measure', defaultAgg: 'avg', format: '0.00' },
      { key: 'tbt_ms', label: 'TBT (ms)', role: 'measure', defaultAgg: 'avg', format: '0' },
    ],
    viz: ['table', 'bar', 'horizontal-bar', 'scatter', 'kpi', 'stat-card'],
    defaultSpec: {
      groupBy: 'url',
      measures: [{ field: 'performance_score', agg: 'avg', label: 'Performance', format: '0.0' }],
      sort: { by: 'Performance', dir: 'asc' },
      topN: { n: 15 },
    },
  },

  // ── Content ────────────────────────────────────────────────────────────────
  {
    id: 'thin_pages',
    label: 'Thin pages',
    group: 'Content',
    section: 'content',
    description: 'Pages with low word count.',
    preAggregated: true,
    accessor: (d) => arr(d.content_analytics?.thin_pages),
    fields: [
      { key: 'url', label: 'URL', role: 'dimension' },
      { key: 'word_count', label: 'Word count', role: 'measure', defaultAgg: 'avg', format: '0' },
    ],
    viz: ['table', 'bar', 'horizontal-bar', 'kpi'],
    defaultSpec: {
      groupBy: 'url',
      measures: [{ field: 'word_count', agg: 'avg', label: 'Word count' }],
      sort: { by: 'Word count', dir: 'asc' },
      topN: { n: 20 },
    },
  },
  {
    id: 'word_count_distribution',
    label: 'Word-count distribution',
    group: 'Content',
    section: 'content',
    description: 'Page counts per word-count bucket.',
    preAggregated: true,
    accessor: (d) => fromMap(d.content_analytics?.word_count_distribution as Record<string, unknown> | undefined),
    fields: [
      { key: 'label', label: 'Bucket', role: 'dimension' },
      { key: 'value', label: 'Pages', role: 'measure', defaultAgg: 'sum', format: '0' },
    ],
    viz: ['bar', 'horizontal-bar', 'pie', 'doughnut', 'funnel', 'table'],
    defaultSpec: { groupBy: 'label', measures: [{ field: 'value', agg: 'sum', label: 'Pages' }] },
  },

  // ── Structure / gallery ────────────────────────────────────────────────────
  {
    id: 'depth_distribution',
    label: 'Crawl depth distribution',
    group: 'Structure',
    section: 'structure',
    description: 'Page counts by crawl depth.',
    preAggregated: true,
    accessor: (d) => fromMap(d.depth_distribution?.by_depth as Record<string, unknown> | undefined),
    fields: [
      { key: 'label', label: 'Depth', role: 'dimension' },
      { key: 'value', label: 'Pages', role: 'measure', defaultAgg: 'sum', format: '0' },
    ],
    viz: ['bar', 'horizontal-bar', 'funnel', 'line', 'area', 'table'],
    defaultSpec: { groupBy: 'label', measures: [{ field: 'value', agg: 'sum', label: 'Pages' }], sort: { by: 'category', dir: 'asc' } },
  },
  {
    id: 'mime_types',
    label: 'Content types',
    group: 'Structure',
    section: 'gallery',
    description: 'URL counts per MIME / content type.',
    preAggregated: true,
    accessor: (d) => fromParallel(d.mime_labels, d.mime_values),
    fields: [
      { key: 'label', label: 'Content type', role: 'dimension' },
      { key: 'value', label: 'URLs', role: 'measure', defaultAgg: 'sum', format: '0' },
    ],
    viz: ['pie', 'doughnut', 'bar', 'horizontal-bar', 'treemap', 'table'],
    defaultSpec: { groupBy: 'label', measures: [{ field: 'value', agg: 'sum', label: 'URLs' }], sort: { by: 'URLs', dir: 'desc' } },
  },
];

export const datasetById = new Map<string, DatasetDef>(DATASETS.map((d) => [d.id, d]));

export function getDataset(id: string): DatasetDef | undefined {
  return datasetById.get(id);
}

/** Datasets grouped by their `group` for the picker, preserving first-seen order. */
export function datasetsByGroup(): { group: string; datasets: DatasetDef[] }[] {
  const out: { group: string; datasets: DatasetDef[] }[] = [];
  const idx = new Map<string, number>();
  for (const d of DATASETS) {
    const g = d.group ?? 'Other';
    let i = idx.get(g);
    if (i === undefined) {
      i = out.length;
      idx.set(g, i);
      out.push({ group: g, datasets: [] });
    }
    out[i].datasets.push(d);
  }
  return out;
}
