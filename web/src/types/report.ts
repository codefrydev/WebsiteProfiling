import type {
  Ga4ChannelRow,
  Ga4DeviceRow,
  Ga4PageRow,
  GscDailyRow,
  GscPageRow,
  GscQueryRow,
  GscSampleLinkRow,
  GscTopLinkedPageRow,
  GscTopLinkingSiteRow,
  GscTopLinkingTextRow,
  KeywordRow,
  UrlJoinData,
} from '@/types/components';

export type {
  Ga4ChannelRow,
  Ga4DeviceRow,
  Ga4PageRow,
  GscDailyRow,
  GscPageRow,
  GscQueryRow,
  KeywordRow,
  UrlJoinData,
} from '@/types/components';

export interface ViewNavigateOptions {
  domain?: string;
  reportId?: number;
}

/** Props shared by report shell view components. */
export interface ViewProps {
  searchQuery?: string;
  onNavigate?: (id: string, opts?: ViewNavigateOptions) => void;
  onOpenIntegrations?: () => void;
}

export interface ReportIssue {
  message?: string;
  url?: string;
  priority?: string;
  recommendation?: string;
  type?: string;
  severity?: string;
  finding_type?: string;
  status?: string | number;
  final_url?: string;
}

export interface DistributionMap {
  [bucket: string]: number;
}

export interface ContentUrlEntry {
  url: string;
  title?: string;
  meta_desc_len?: number;
  h1_count?: number;
  content_length?: number;
}

export type ContentUrlsMap = Record<string, ContentUrlEntry[]>;

export interface ContentDuplicateCluster {
  id: string;
  representative_url: string;
  member_count?: number;
  member_urls?: string[];
}

export interface ReportRedirect {
  url?: string;
  from?: string;
  final_url?: string;
  to?: string;
  status?: string | number;
}

export interface SecurityFinding {
  severity?: string;
  finding_type?: string;
  url?: string;
  message?: string;
  recommendation?: string;
}

export interface ReportIssuesBucket {
  broken?: ReportIssue[];
  redirects?: ReportIssue[];
  seo?: ReportIssue[];
}

export interface SeoHealthStats {
  missing_title?: number;
  title_short?: number;
  title_long?: number;
  title_ok?: number;
  missing_meta_desc?: number;
  meta_desc_short?: number;
  meta_desc_long?: number;
  meta_desc_ok?: number;
  h1_zero?: number;
  h1_one?: number;
  h1_multi?: number;
  thin_content?: number;
}

export interface SocialCoverageStats {
  og_coverage_pct?: number;
  twitter_coverage_pct?: number;
  og_image_coverage_pct?: number;
  missing_og?: string[];
  missing_twitter?: string[];
  og_image_missing?: string[];
}

export interface ThinPageEntry {
  url: string;
  word_count?: number;
}

export interface SiteKeywordEntry {
  word: string;
  count: number;
}

export interface TopicCluster {
  representative?: string;
  top_keyword?: string;
  cluster_score?: number | string;
  keywords?: string[];
  [key: string]: unknown;
}

export interface ContentAnalyticsData {
  word_count_stats?: {
    mean?: number;
    median?: number;
    p25?: number;
    p75?: number;
    p50?: number;
    p95?: number;
    min?: number;
    max?: number;
  };
  word_count_distribution?: DistributionMap;
  reading_level_distribution?: DistributionMap;
  content_ratio_distribution?: DistributionMap;
  top_keywords_site?: SiteKeywordEntry[];
  thin_pages?: ThinPageEntry[];
  [key: string]: unknown;
}

export interface ResponseTimeStats {
  p25?: number;
  p50?: number;
  p75?: number;
  p95?: number;
  p99?: number;
  distribution?: DistributionMap;
  slow_pages?: unknown[];
}

export interface DepthDistribution {
  max_depth?: number;
  avg_depth?: number;
  by_depth?: Record<string, number>;
}

export interface TechStackEntry {
  name?: string;
  tech?: string;
  count?: number;
  sample_urls?: string[];
}

export interface TechStackSummary {
  technologies?: TechStackEntry[];
  total_pages_analyzed?: number;
}

export interface HreflangSummary {
  pages_200?: number;
  pages_missing_html_lang?: number;
  pages_with_hreflang_links?: number;
}

export interface OutboundLinkDomain {
  host: string;
  link_count?: number;
  page_count?: number;
}

export interface LighthouseAudit {
  id?: string;
  title?: string;
  description?: string;
  score?: number;
  [key: string]: unknown;
}

export interface LighthouseFailure {
  id?: string;
  impact?: string;
  helpText?: string;
  evidence?: unknown[];
  [key: string]: unknown;
}

export interface LighthouseDiagnostic {
  warning?: string;
  lighthouse_audit_id?: string;
  id?: string;
  primary_impact?: string;
  severity?: string;
  one_line_fix?: string;
  detailed_fix?: string;
  helpText?: string;
  estimated_impact?: string;
  evidence?: unknown[];
  references?: { nodes?: unknown[] };
  [key: string]: unknown;
}

export interface LighthousePageSummary extends LighthouseSummary {
  url?: string;
  human_summary?: string;
  human_summary_full?: string;
  median_metrics?: Record<string, number | string | null>;
  category_scores?: Record<string, number | null>;
  top_failures?: LighthouseFailure[];
  strategy?: string;
  device?: string;
  mode?: string;
  categories?: string[];
  run_timestamp?: string;
  iterations?: number;
  audits?: LighthouseAudit[];
  diagnostics?: LighthouseDiagnostic[];
}

export interface GscReportData {
  site_url?: string;
  summary?: {
    clicks?: number;
    impressions?: number;
    ctr?: number;
    position?: number;
  };
  top_queries?: GscQueryRow[];
  top_pages?: GscPageRow[];
  daily?: GscDailyRow[];
}

export interface Ga4ReportData {
  property_id?: string;
  summary?: {
    sessions?: number;
    activeUsers?: number;
    screenPageViews?: number;
    engagementRate?: number;
    averageSessionDuration?: number;
  };
  top_pages?: Ga4PageRow[];
  daily?: { date: string; sessions?: number; activeUsers?: number }[];
  by_channel?: Ga4ChannelRow[];
  by_device?: Ga4DeviceRow[];
}

export interface GoogleDateRange {
  start?: string;
  end?: string;
}

export interface GoogleReportData {
  fetched_at?: string;
  date_range?: GoogleDateRange;
  errors?: string[];
  gsc?: GscReportData;
  ga4?: Ga4ReportData;
  url_join?: UrlJoinData;
  [key: string]: unknown;
}

export interface KeywordReportData {
  rows?: KeywordRow[];
  brand_name?: string;
  fetched_at?: string;
  total_keywords?: number;
  gsc_keyword_count?: number;
  suggest_count?: number;
  cannibalisation_count?: number;
  cannibalisation?: unknown[];
  [key: string]: unknown;
}

export interface GscLinksReportData {
  imported_at?: string;
  source?: 'gsc_links_csv';
  export_types?: string[];
  row_counts?: Record<string, number>;
  top_linking_sites?: GscTopLinkingSiteRow[];
  top_linked_pages?: GscTopLinkedPageRow[];
  top_linking_text?: GscTopLinkingTextRow[];
  sample_links?: GscSampleLinkRow[];
  latest_links?: GscSampleLinkRow[];
  sample_links_full_count?: number;
  latest_links_full_count?: number;
  errors?: string[];
  [key: string]: unknown;
}

export interface SiteLevelChecks {
  robots_present?: boolean;
  sitemap_present?: boolean;
  sitemap_valid?: boolean;
}

export interface NerSiteSummary {
  total_entities?: number;
  pages_with_ner?: number;
  counts?: Record<string, number>;
  label_counts?: Record<string, number>;
  mixed_site?: boolean;
}

export interface LanguageSummary {
  counts?: Record<string, number>;
  mixed_site?: boolean;
}

export interface KeywordOpportunityItem {
  keyword?: string;
  recommended_action?: string;
  score?: number;
}

export interface KeywordOpportunities {
  quick_wins?: KeywordOpportunityItem[];
  high_value?: KeywordOpportunityItem[];
  token_topic_clusters?: TopicCluster[];
}

export interface GraphEdge {
  from?: string;
  to?: string;
  [key: string]: unknown;
}

export type GraphNode = string | { id?: string; url?: string };

export interface GalleryImageRef {
  pageUrl: string;
  kind: 'content' | 'og' | 'twitter' | string;
}

export interface GalleryImageItem {
  src: string;
  refs: GalleryImageRef[];
}

/** JSON report payload stored in report_payload.data (partial known shape). */
export interface ReportPayload {
  site_name?: string;
  crawl_run_id?: number;
  crawl_run_created_at?: string;
  crawl_only_preview?: boolean;
  report_generated_at?: string;
  report_meta?: {
    data_sources?: string[];
    generated_at?: string;
    crawl_run_id?: number;
    crawl_run_created_at?: string;
    crawl_scope?: {
      pages_crawled?: number;
      max_pages_configured?: number;
      robots_blocked_count?: number;
      static_html_only?: boolean;
      render_mode?: string;
      js_concurrency?: number | null;
      pages_static?: number;
      pages_rendered?: number;
      crawl_limited?: boolean;
      browser_diagnostics?: BrowserDiagnosticsAggregate;
    };
    google_fetched_at?: string;
    google_date_range_days?: number;
    gsc_links_imported_at?: string;
    gsc_links_referring_domains?: number;
    gsc_links_sample_count?: number;
    llm?: { model?: string; prompt_version?: string; generated_at?: string };
  };
  links?: ReportLink[];
  top_pages?: ReportTopPage[];
  summary?: ReportSummary;
  categories?: ReportCategory[];
  url_fingerprints?: UrlFingerprint[];
  google?: GoogleReportData;
  keywords?: KeywordReportData;
  gsc_links?: GscLinksReportData;
  lighthouse_summary?: LighthousePageSummary;
  lighthouse_diagnostics?: LighthouseDiagnostic[];
  lighthouse_human_summary?: string;
  redirects?: ReportRedirect[];
  content_urls?: ContentUrlsMap;
  content_duplicates?: ContentDuplicateCluster[];
  security_findings?: SecurityFinding[];
  issues?: ReportIssuesBucket;
  seo_health?: SeoHealthStats;
  social_coverage?: SocialCoverageStats;
  content_analytics?: ContentAnalyticsData;
  response_time_stats?: ResponseTimeStats;
  depth_distribution?: DepthDistribution;
  tech_stack_summary?: TechStackSummary;
  site_level?: SiteLevelChecks;
  ner_site_summary?: NerSiteSummary;
  language_summary?: LanguageSummary;
  keyword_opportunities?: KeywordOpportunities;
  graph_nodes?: GraphNode[];
  graph_edges?: GraphEdge[];
  recommendations?: string[];
  mime_labels?: string[];
  mime_values?: number[];
  outlink_labels?: string[];
  outlink_counts?: number[];
  title_labels?: string[];
  title_counts?: number[];
  domain_labels?: string[];
  domain_values?: number[];
  hreflang_summary?: HreflangSummary;
  outbound_link_domains?: OutboundLinkDomain[];
  ml_errors?: string[];
  semantic_keyword_clusters?: TopicCluster[];
  status_counts?: Record<string, number>;
  lighthouse_by_url?: Record<string, LighthousePageSummary>;
  [key: string]: unknown;
}

export interface ReportLink {
  url: string;
  status?: string;
  title?: string;
  inlinks?: number;
  outlinks?: number;
  word_count?: number;
  response_time_ms?: number;
  depth?: number;
  pagerank?: number;
  degree?: number;
  og_image?: string;
  twitter_image?: string;
  page_analysis?: { image_urls?: string[]; browser?: BrowserDiagnostics };
  lighthouse?: {
    median_metrics?: {
      performance_score?: number;
      seo_score?: number;
    };
  };
  console_error_count?: number;
  page_error_count?: number;
  has_browser_errors?: boolean;
}

export interface ReportTopPage {
  url: string;
  title?: string;
  status?: string;
  inlinks?: number;
  outlinks?: number;
  pagerank?: number;
  degree?: number;
}

export interface ReportSummary {
  total_urls?: number;
  count_2xx?: number;
  count_3xx?: number;
  count_4xx?: number;
  count_5xx?: number;
  count_error?: number;
  success_rate?: number;
  crawl_time_s?: number;
  avg_outlinks?: number;
}

export interface ReportCategory {
  score?: number;
  name?: string;
  id?: string;
  issues?: ReportIssue[];
  [key: string]: unknown;
}

export interface UrlFingerprint {
  url: string;
  content_fingerprint?: string;
  structure_fingerprint?: string;
}

export interface LighthouseSummary {
  url?: string;
  [key: string]: unknown;
}

export interface CrawlRunRow {
  id: number;
  start_url: string;
  created_at: string;
}

export interface CrawlRunSummary {
  crawl_run_id: number;
  start_url: string;
  created_at: string;
  url_count: number;
  s2xx: number;
  s3xx: number;
  s4xx: number;
  s5xx: number;
  other: number;
}

export interface ReportListRow {
  id: number;
  generated_at: string;
  site_name: string;
  canonical_domain: string;
}

export interface ReportMetaResponse {
  reports: ReportListRow[];
  crawlRuns: CrawlRunRow[];
}

export interface StatusCounts {
  s2xx: number;
  s3xx: number;
  s4xx: number;
  s5xx: number;
  other: number;
}

export interface PortfolioGroup {
  domainName: string;
  crawlUrl: string;
  urlCount: number;
  healthScore: number;
  statusCounts: StatusCounts;
  lastCrawl: string;
  reportId: number | null;
  crawlRunId?: number;
  crawlOnly?: boolean;
  generatedAtMs: number;
  domainParam: string;
}

export interface ReportFingerprintDiff {
  newUrls: string[];
  removedUrls: string[];
  contentChanged: string[];
  structureChanged: string[];
}

export interface PathRollupMetrics {
  pages: number;
  inlinks: number;
  outlinks: number;
  avgWordCount: number | null;
  avgResponseMs: number | null;
  avgPerfScore: number | null;
  avgSeoScore: number | null;
}

export interface PathRollup {
  pages: number;
  inlinks: number;
  outlinks: number;
  wcSum: number;
  wcN: number;
  rtSum: number;
  rtN: number;
  lhPerfSum: number;
  lhPerfN: number;
  lhSeoSum: number;
  lhSeoN: number;
}

export interface PathTreeNode {
  pathKey: string;
  segment: string;
  children: PathTreeNode[];
  current: PathRollupMetrics;
  baseline: PathRollupMetrics | null;
}

export interface PathTreeTableRow extends PathTreeNode {
  depth: number;
}

export type BadgeVariant =
  | 'critical'
  | 'high'
  | 'medium'
  | 'low'
  | 'info'
  | 'success';

/** Extended link fields used by inspector / link tabs (ReportLink also allows arbitrary keys). */
export interface LinkDetail extends Omit<ReportLink, 'page_analysis' | 'lighthouse'> {
  meta_description?: string;
  meta_description_len?: number;
  depth?: number;
  h1?: string;
  h1_count?: number;
  content_type?: string;
  redirect_chain_length?: number;
  reading_level?: number;
  content_html_ratio?: number;
  content_excerpt?: string;
  heading_sequence?: string;
  top_keywords?: string;
  canonical_url?: string;
  noindex?: boolean;
  has_schema?: boolean;
  viewport_present?: boolean;
  og_title?: string;
  og_description?: string;
  og_type?: string;
  og_image?: string;
  twitter_card?: string;
  twitter_title?: string;
  twitter_image?: string;
  tech_stack?: string;
  cache_control?: string;
  etag?: string;
  script_count?: number;
  link_stylesheet_count?: number;
  mixed_content_count?: number;
  images_total?: number;
  images_without_alt?: number;
  img_without_lazy?: number;
  aria_count?: number;
  internal_link_count?: number;
  external_link_count?: number;
  duplicate_group_id?: string;
  detected_language?: string;
  similar_internal?: unknown;
  keyphrases?: { phrases?: unknown[] };
  nlp_entities?: NlpSignals;
  page_analysis?: PageAnalysis;
  lighthouse?: LinkLighthouseData | null;
}

export interface NlpSignals {
  entity_count?: number;
  top_entity_labels?: unknown[];
  [key: string]: unknown;
}

export interface PageWarning {
  id?: string;
  severity?: string;
  message?: string;
  detail?: string;
  [key: string]: unknown;
}

export interface BrowserConsoleMessage {
  level?: string;
  text?: string;
  source_url?: string;
  line?: number;
}

export interface BrowserPageError {
  message?: string;
  stack?: string;
}

export interface BrowserFailedRequest {
  url?: string;
  method?: string;
  failure?: string;
}

export interface BrowserDiagnosticsSummary {
  console_error_count?: number;
  console_warning_count?: number;
  page_error_count?: number;
  failed_request_count?: number;
}

export interface BrowserDiagnostics {
  console?: BrowserConsoleMessage[];
  page_errors?: BrowserPageError[];
  failed_requests?: BrowserFailedRequest[];
  summary?: BrowserDiagnosticsSummary;
}

export interface TopConsoleMessage {
  text?: string;
  count?: number;
  sample_urls?: string[];
}

export interface BrowserDiagnosticsAggregate {
  pages_with_console_errors?: number;
  pages_with_page_errors?: number;
  total_console_errors?: number;
  total_page_errors?: number;
  top_console_messages?: TopConsoleMessage[];
}

export interface PageAnalysis {
  internal_link_count?: number;
  external_link_count?: number;
  preload_count?: number;
  preconnect_count?: number;
  warnings?: PageWarning[];
  internal_links?: string[];
  external_links?: string[];
  stylesheet_urls?: string[];
  script_urls?: string[];
  image_urls?: string[];
  browser?: BrowserDiagnostics;
  signals?: { nlp_entities?: NlpSignals; language?: string };
  [key: string]: unknown;
}

export interface LinkLighthouseData {
  category_scores?: Record<string, number | null>;
  median_metrics?: Record<string, number | null>;
  top_failures?: LighthouseAuditRef[];
  audits?: LighthouseAuditRef[];
  [key: string]: unknown;
}

export interface LighthouseAuditRef {
  id?: string;
  title?: string;
  description?: string;
  helpText?: string;
  displayValue?: string;
  score?: number | null;
  details?: {
    items?: unknown[];
    headings?: LhTableHeading[];
  };
  [key: string]: unknown;
}

export interface LhTableHeading {
  key?: string;
  label?: string | { formattedDefault?: string };
  valueType?: string;
}

export interface LighthouseImpactGroup {
  label: string;
  color: string;
  border: string;
}

export interface LighthouseQuickWin {
  iconKey?: string;
  title: string;
  why: string;
  how: string;
  impact: string;
  [key: string]: unknown;
}

export type MultiPageMetricCol =
  | 'performance'
  | 'accessibility'
  | 'seo'
  | 'best-practices'
  | 'lcp_ms'
  | 'cls'
  | 'tbt_ms'
  | 'fcp_ms';

export interface MultiPageTableRow {
  url: string;
  performance: number | null;
  accessibility: number | null;
  seo: number | null;
  'best-practices': number | null;
  lcp_ms: number | null;
  cls: number | null;
  tbt_ms: number | null;
  fcp_ms: number | null;
}

export interface InspectorBrokenItem {
  url: string;
  status?: number | string;
}

export interface InspectorRedirectItem {
  url: string;
  status?: number | string;
  final_url?: string;
}

export interface InspectorSeoIssue {
  url: string;
  type?: string;
  message?: string;
}

export interface InspectorContentFlag {
  type: string;
  label: string;
  detail?: string | null;
  recommendation?: string;
}

export interface InspectorCategoryIssue {
  url?: string;
  category?: string;
  priority?: string;
  message?: string;
  recommendation?: string;
}

export interface InspectorSecurityFinding {
  url?: string;
  severity?: string;
  message?: string;
  recommendation?: string;
}

export interface InspectorBrowserIssue {
  severity: string;
  message: string;
  detail?: string;
  recommendation?: string;
}

export interface InspectorDetails {
  broken: InspectorBrokenItem[];
  redirects: InspectorRedirectItem[];
  seoIssues: InspectorSeoIssue[];
  contentFlags: InspectorContentFlag[];
  categoryIssues: InspectorCategoryIssue[];
  securityFindings: InspectorSecurityFinding[];
  browserIssues: InspectorBrowserIssue[];
  recommendations: string[];
}

export interface InspectorIssueRow {
  severity: string;
  message: string;
  type: string;
  recommendation?: string;
  category?: string;
  detail?: string;
}

export interface ContentAnalyticsStats {
  mean?: number;
  median?: number;
}

export interface SimilarInternalRow {
  url: string;
  score: number | null;
}
