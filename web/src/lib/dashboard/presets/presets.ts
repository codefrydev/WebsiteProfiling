/**
 * Starter dashboard templates, expressed in the v2 dataset/query model.
 * Each preset builds a fresh DashboardDoc with new widget ids.
 */
import { newWidgetId, type DashboardDoc, type Widget } from '@/lib/dashboard/engine/doc';
import { getDataset } from '@/lib/dashboard/engine/datasets';
import type { QuerySpec, VizType } from '@/lib/dashboard/engine/types';

interface PresetWidgetDef {
  datasetId: string;
  viz: VizType;
  title?: string;
  layout: { x: number; y: number; w: number; h: number };
  query?: Partial<QuerySpec>;
}

function mk(def: PresetWidgetDef): Widget | null {
  const d = getDataset(def.datasetId);
  if (!d) return null;
  return {
    id: newWidgetId(),
    title: def.title ?? '',
    datasetId: def.datasetId,
    viz: def.viz,
    query: { ...(d.defaultSpec ?? {}), ...(def.query ?? {}) } as QuerySpec,
    vizOptions: {},
    layout: def.layout,
  };
}

function build(defs: PresetWidgetDef[]): DashboardDoc {
  return { version: 2, widgets: defs.map(mk).filter((w): w is Widget => w !== null), slicers: [] };
}

export interface DashboardPreset {
  id: string;
  name: string;
  tagline: string;
  description: string;
  build: () => DashboardDoc;
}

export const DASHBOARD_PRESETS: DashboardPreset[] = [
  {
    id: 'overview',
    name: 'Audit overview',
    tagline: 'Health, status & issues',
    description: 'Health score, page counts, status mix, category scores and top issues.',
    build: () => build([
      { datasetId: 'summary', viz: 'kpi', title: 'Health score', layout: { x: 0, y: 0, w: 3, h: 2 }, query: { measures: [{ field: 'health_score', agg: 'max', label: 'Health', format: 'score' }] } },
      { datasetId: 'summary', viz: 'stat-card', title: 'Total URLs', layout: { x: 3, y: 0, w: 3, h: 2 }, query: { measures: [{ field: 'total_urls', agg: 'max', label: 'URLs' }] } },
      { datasetId: 'summary', viz: 'stat-card', title: 'Issues', layout: { x: 6, y: 0, w: 3, h: 2 }, query: { measures: [{ field: 'seo_health.thin_content', agg: 'max', label: 'Thin pages' }] } },
      { datasetId: 'status_counts', viz: 'doughnut', title: 'Status codes', layout: { x: 9, y: 0, w: 3, h: 4 } },
      { datasetId: 'categories', viz: 'horizontal-bar', title: 'Category scores', layout: { x: 0, y: 2, w: 5, h: 4 } },
      { datasetId: 'issues', viz: 'bar', title: 'Issues by category', layout: { x: 5, y: 2, w: 4, h: 4 } },
      { datasetId: 'issues', viz: 'table', title: 'Issues', layout: { x: 0, y: 6, w: 12, h: 5 }, query: { groupBy: undefined, measures: [], columns: ['category', 'priority', 'message', 'url'] } },
    ]),
  },
  {
    id: 'performance',
    name: 'Performance',
    tagline: 'Lighthouse & speed',
    description: 'Lighthouse scores, per-page performance and slowest responses.',
    build: () => build([
      { datasetId: 'summary', viz: 'gauge', title: 'Lighthouse performance', layout: { x: 0, y: 0, w: 4, h: 3 }, query: { measures: [{ field: 'lh.performance_score', agg: 'max', label: 'Performance', format: 'score' }] } },
      { datasetId: 'summary', viz: 'kpi', title: 'Lighthouse SEO', layout: { x: 4, y: 0, w: 4, h: 2 }, query: { measures: [{ field: 'lh.seo_score', agg: 'max', label: 'SEO', format: 'score' }] } },
      { datasetId: 'lighthouse_by_url', viz: 'horizontal-bar', title: 'Performance by page', layout: { x: 0, y: 3, w: 6, h: 5 } },
      { datasetId: 'lighthouse_by_url', viz: 'scatter', title: 'LCP vs CLS', layout: { x: 6, y: 3, w: 6, h: 5 }, query: { groupBy: 'url', measures: [{ field: 'lcp_ms', agg: 'avg', label: 'LCP' }, { field: 'cls', agg: 'avg', label: 'CLS' }] } },
    ]),
  },
  {
    id: 'traffic',
    name: 'Search traffic',
    tagline: 'GSC clicks & queries',
    description: 'Google Search Console clicks, impressions, top queries and trend.',
    build: () => build([
      { datasetId: 'summary', viz: 'kpi', title: 'Clicks', layout: { x: 0, y: 0, w: 3, h: 2 }, query: { measures: [{ field: 'gsc.clicks', agg: 'max', label: 'Clicks' }] } },
      { datasetId: 'summary', viz: 'stat-card', title: 'Impressions', layout: { x: 3, y: 0, w: 3, h: 2 }, query: { measures: [{ field: 'gsc.impressions', agg: 'max', label: 'Impr.' }] } },
      { datasetId: 'gsc_daily', viz: 'area', title: 'Clicks over time', layout: { x: 6, y: 0, w: 6, h: 4 } },
      { datasetId: 'gsc_top_queries', viz: 'horizontal-bar', title: 'Top queries', layout: { x: 0, y: 2, w: 6, h: 5 } },
      { datasetId: 'gsc_top_pages', viz: 'table', title: 'Top pages', layout: { x: 6, y: 4, w: 6, h: 5 } },
    ]),
  },
  {
    id: 'content',
    name: 'Content & crawl',
    tagline: 'Words, depth & types',
    description: 'Word-count distribution, crawl depth, content types and thin pages.',
    build: () => build([
      { datasetId: 'word_count_distribution', viz: 'bar', title: 'Word-count distribution', layout: { x: 0, y: 0, w: 6, h: 4 } },
      { datasetId: 'depth_distribution', viz: 'funnel', title: 'Crawl depth', layout: { x: 6, y: 0, w: 6, h: 4 } },
      { datasetId: 'mime_types', viz: 'pie', title: 'Content types', layout: { x: 0, y: 4, w: 5, h: 4 } },
      { datasetId: 'thin_pages', viz: 'table', title: 'Thin pages', layout: { x: 5, y: 4, w: 7, h: 4 } },
    ]),
  },
];

export function getPreset(id: string): DashboardPreset | undefined {
  return DASHBOARD_PRESETS.find((p) => p.id === id);
}
