import { describe, it, expect } from 'vitest';
import { DATASETS, datasetById, datasetsByGroup } from '@/lib/dashboard/engine/datasets';
import { SECTION_KEYS } from '@/lib/reportSections';
import { measureLabel } from '@/lib/dashboard/engine/runQuery';
import type { ReportCategory, ReportPayload } from '@/types/report';

/** A payload that touches every section a dataset reads from. (Cast: real link
 *  rows carry more fields than the partial ReportLink interface declares.) */
const PAYLOAD = {
  summary: { total_urls: 100, count_2xx: 90, count_4xx: 8, count_5xx: 2, success_rate: 90, avg_outlinks: 5, site_health_score: 72 },
  seo_health: { missing_title: 3, missing_meta_desc: 4, thin_content: 6 },
  social_coverage: { og_coverage_pct: 65 },
  portfolio_benchmark: { property_health_score: 78 },
  site_health_score: 72,
  status_counts: { '200': 90, '404': 8, '500': 2 },
  categories: [
    { id: 'seo', name: 'Technical SEO', score: 80, issues: [{ message: 'm1', priority: 'High', impact_score: 5 }] },
    { id: 'perf', name: 'Performance', score: 55, issues: [{ message: 'm2', priority: 'Low' }, { message: 'm3' }] },
  ],
  links: [
    { url: 'https://x.com/a', status: '200', depth: 0, word_count: 500, inlinks: 3, outlinks: 10, response_time_ms: 120, images_total: 4, images_without_alt: 1 },
    { url: 'https://x.com/blog/b', status: '404', depth: 2, word_count: 50, inlinks: 0, outlinks: 2, response_time_ms: 800, images_total: 0, images_without_alt: 0 },
  ],
  outbound_link_domains: [{ host: 'github.com', link_count: 12, page_count: 3 }],
  google: {
    gsc: {
      summary: { clicks: 500, impressions: 9000, ctr: 0.055, position: 8.2 },
      top_queries: [{ query: 'foo', clicks: 50, impressions: 900, ctr: 0.05, position: 4 }],
      top_pages: [{ page: '/a', clicks: 30, impressions: 400, ctr: 0.075, position: 6 }],
      daily: [{ date: '2024-01-01', clicks: 10, impressions: 200 }],
    },
    ga4: {
      summary: { sessions: 1200, activeUsers: 900 },
      top_pages: [{ path: '/a', sessions: 100, activeUsers: 80, screenPageViews: 130, engagementRate: 0.6 }],
      by_channel: [{ channel: 'Organic', sessions: 800 }],
      by_device: [{ device: 'mobile', sessions: 700 }],
    },
  },
  keywords: { rows: [{ keyword: 'foo', intent: 'informational', difficulty: 20, gsc_clicks: 50, gsc_impressions: 900, gsc_position: 4, traffic_potential: 120 }] },
  gsc_links: { top_linking_sites: [{ site: 'a.com', link_count: 5, target_page_count: 2 }] },
  lighthouse_by_url: {
    'https://x.com/a': { category_scores: { performance: 0.9, seo: 1, accessibility: 0.8 }, median_metrics: { lcp_ms: 1200, cls: 0.02, tbt_ms: 100 } },
  },
  content_analytics: {
    thin_pages: [{ url: '/b', word_count: 50 }],
    word_count_distribution: { '0-100': 5, '101-300': 10 },
  },
  depth_distribution: { by_depth: { '0': 1, '1': 5, '2': 20 } },
  mime_labels: ['text/html', 'application/json'],
  mime_values: [80, 20],
  lighthouse_summary: { median_metrics: { performance_score: 88, seo_score: 95 } },
} as unknown as ReportPayload;

describe('dataset registry integrity', () => {
  it('has unique ids and datasetById matches', () => {
    const ids = DATASETS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(datasetById.size).toBe(ids.length);
  });

  it('every dataset declares a real SectionKey', () => {
    for (const d of DATASETS) expect(SECTION_KEYS).toContain(d.section);
  });

  it('every measure field has a defaultAgg; non-empty viz list', () => {
    for (const d of DATASETS) {
      expect(d.viz.length).toBeGreaterThan(0);
      for (const f of d.fields) {
        if (f.role === 'measure') expect(f.defaultAgg, `${d.id}.${f.key}`).toBeTruthy();
      }
    }
  });

  it('defaultSpec.groupBy and measures reference declared fields', () => {
    for (const d of DATASETS) {
      const keys = new Set(d.fields.map((f) => f.key));
      const spec = d.defaultSpec;
      if (spec?.groupBy) expect(keys.has(spec.groupBy), `${d.id} groupBy ${spec.groupBy}`).toBe(true);
      for (const m of spec?.measures ?? []) {
        if (!m.computed) expect(keys.has(m.field), `${d.id} measure ${m.field}`).toBe(true);
      }
    }
  });

  it('every accessor runs on a full payload and returns an array', () => {
    for (const d of DATASETS) {
      const rows = d.accessor(PAYLOAD);
      expect(Array.isArray(rows), d.id).toBe(true);
    }
  });

  it('key datasets extract expected rows', () => {
    expect(datasetById.get('links')!.accessor(PAYLOAD)).toHaveLength(2);
    expect(datasetById.get('issues')!.accessor(PAYLOAD)).toHaveLength(3);
    expect(datasetById.get('status_counts')!.accessor(PAYLOAD)).toHaveLength(3);
    expect(datasetById.get('mime_types')!.accessor(PAYLOAD)).toHaveLength(2);
    expect(datasetById.get('summary')!.accessor(PAYLOAD)[0].health_score).toBe(72);
    // links accessor derives host/path
    expect(datasetById.get('links')!.accessor(PAYLOAD)[0].host).toBe('x.com');
  });

  it('summary health_score falls back to weighted categories when payload field missing', () => {
    const weightedCategories: ReportCategory[] = [
      { id: 'technical_seo', name: 'Technical SEO', score: 80, issues: [] },
      { id: 'link_health', name: 'Link Health', score: 60, issues: [] },
      { id: 'performance', name: 'Performance', score: 70, issues: [] },
      { id: 'security', name: 'Security', score: 90, issues: [] },
      { id: 'core_web_vitals', name: 'CWV', score: 50, issues: [] },
      { id: 'mobile', name: 'Mobile', score: 40, issues: [] },
      { id: 'html_accessibility', name: 'A11y', score: 100, issues: [] },
      { id: 'search_performance', name: 'Search', score: 10, issues: [] },
      { id: 'intelligence', name: 'Intel', score: 0, issues: [] },
    ];
    const legacyPayload = {
      portfolio_benchmark: { property_health_score: 78 },
      categories: weightedCategories,
    } as unknown as ReportPayload;
    expect(datasetById.get('summary')!.accessor(legacyPayload)[0].health_score).toBe(70);
  });

  it('measureLabel falls back to agg(field)', () => {
    expect(measureLabel({ field: 'x', agg: 'sum' })).toBe('sum(x)');
    expect(measureLabel({ field: 'x', agg: 'sum', label: 'Total' })).toBe('Total');
  });

  it('datasetsByGroup buckets datasets', () => {
    const groups = datasetsByGroup();
    expect(groups.length).toBeGreaterThan(0);
    expect(groups.flatMap((g) => g.datasets).length).toBe(DATASETS.length);
  });
});
