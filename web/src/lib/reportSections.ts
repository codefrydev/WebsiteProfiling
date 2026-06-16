import type { ReportPayload } from '@/types/report';

export const SECTION_KEYS = [
  'core',
  'links',
  'traffic',
  'keywords',
  'issues',
  'content',
  'lighthouse',
  'security',
  'gsc-links',
  'structure',
  'tech',
  'indexation',
  'gallery',
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

export const SECTION_FIELDS: Record<SectionKey, ReadonlyArray<keyof ReportPayload>> = {
  core: [
    'site_name',
    'summary',
    'categories',
    'top_pages',
    'recommendations',
    'seo_health',
    'social_coverage',
    'status_counts',
    'portfolio_benchmark',
    'executive_summary',
    'crux_summary',
    'report_meta',
    'report_generated_at',
    'crawl_only_preview',
    'crawl_run_id',
    'crawl_run_created_at',
    'site_level',
    'ml_errors',
  ],
  links: [
    'links',
    'link_edges',
    'link_rel_summary',
    'inlink_anchor_matrix',
    'outbound_link_domains',
    'outlink_labels',
    'outlink_counts',
  ],
  traffic: ['google'],
  keywords: [
    'keywords',
    'keyword_opportunities',
    'competitor_keyword_gap',
    'semantic_keyword_clusters',
  ],
  issues: ['issues', 'redirects'],
  content: [
    'content_urls',
    'content_duplicates',
    'content_analytics',
    'text_content_analysis',
    'response_time_stats',
  ],
  lighthouse: [
    'lighthouse_summary',
    'lighthouse_by_url',
    'lighthouse_diagnostics',
    'lighthouse_human_summary',
  ],
  security: ['security_findings'],
  'gsc-links': ['gsc_links', 'bing_backlinks'],
  structure: ['graph_nodes', 'graph_edges', 'depth_distribution'],
  tech: ['tech_stack_summary', 'subdomains', 'contact_intelligence'],
  indexation: [
    'indexation_coverage',
    'hreflang_summary',
    'ner_site_summary',
    'language_summary',
    'rich_results_validation',
    'url_fingerprints',
    'rich_results_meta',
  ],
  gallery: [
    'mime_labels',
    'mime_values',
    'title_labels',
    'title_counts',
    'domain_labels',
    'domain_values',
  ],
};

export function slicePayloadForSection(
  payload: ReportPayload,
  section: SectionKey,
): Partial<ReportPayload> {
  const fields = SECTION_FIELDS[section];
  const slice: Partial<ReportPayload> = {};
  for (const field of fields) {
    if (field in payload) {
      (slice as Record<string, unknown>)[field as string] = payload[field as keyof ReportPayload];
    }
  }
  return slice;
}

/** True when merged report data already includes at least one field for this section. */
export function sectionFieldsPresent(
  section: SectionKey,
  data: ReportPayload | null | undefined,
): boolean {
  if (!data) return false;
  for (const field of SECTION_FIELDS[section]) {
    if (field in data && data[field as keyof ReportPayload] != null) {
      return true;
    }
  }
  return false;
}
