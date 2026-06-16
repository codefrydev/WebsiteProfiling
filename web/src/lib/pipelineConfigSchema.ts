/**
 * Pipeline config keys for the runner UI (see input.txt.example for reference).
 * Serialized as `key = value` lines for `python -m src --config`.
 *
 * Field types:
 *   bool      – checkbox (true/false)
 *   tristate  – select: 'auto' | 'true' | 'false' (auto = omit key from file)
 *   number    – integer text input
 *   float     – decimal text input
 *   text          – single-line text input
 *   url           – URL input (full width, help above field)
 *   select        – dropdown with options
 *   singleselect  – single-choice card group (radio buttons)
 *   multiselect   – checkbox group (stored as comma-separated values)
 *   textarea  – multi-line text input
 */
import type { BrowserCrawlStatus } from '@/lib/browserCrawlStatus';
import { crawlRenderModeUsesBrowser } from '@/lib/browserCrawlStatus';
import type { PipelineConfigState } from '@/types/api';

export const BROWSER_CRAWL_UNAVAILABLE_MSG =
  'JavaScript crawl requires Playwright and Chromium. Install: pip install -r requirements.txt. Chrome or Chromium must be on PATH or set CHROME_PATH.';

/** Disclosure tier: 'basic' fields show up-front, 'advanced' behind a disclosure. */
export type FieldTier = 'basic' | 'advanced';

export interface PipelineConfigField {
  key: string;
  label: string;
  type: string;
  defaultValue?: string | boolean | number;
  help?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  span?: 1 | 2;
  unit?: string;
  required?: boolean;
  /** Optional per-field override; otherwise derived from the central tier table. */
  tier?: FieldTier;
  /** Optional per-field override; otherwise derived from the central subgroup table. */
  group?: string;
  visibleWhen?: { key: string; not?: readonly string[] };
}

const JS_FIELD_VISIBLE_WHEN = { key: 'crawl_render_mode', not: ['static'] as const };

export interface PipelineConfigSubgroup {
  id: string;
  label: string;
}

export interface PipelineConfigSection {
  id: string;
  label: string;
  fields: PipelineConfigField[];
  /** Ordered subgroup definitions; fields map in via fieldSubgroup(). */
  subgroups?: PipelineConfigSubgroup[];
}

export const PIPELINE_CONFIG_SECTIONS: PipelineConfigSection[] = [
  {
    id: 'crawl',
    label: 'Crawl',
    subgroups: [
      { id: 'scope', label: 'Scope & limits' },
      { id: 'js', label: 'JavaScript rendering' },
      { id: 'auth', label: 'Authentication & headers' },
      { id: 'storage', label: 'Content storage & extraction' },
      { id: 'output', label: 'Output & history' },
    ],
    fields: [
      {
        key: 'start_url',
        label: 'Site URL',
        type: 'url',
        defaultValue: '',
        required: true,
        placeholder: 'https://example.com',
        help: 'Required before running a crawl or audit. Enter the property site to analyze.',
      },
      {
        key: 'crawl_discovery_mode',
        label: 'URL discovery mode',
        type: 'select',
        defaultValue: 'spider',
        options: [
          { value: 'spider', label: 'Spider — follow internal links' },
          { value: 'list', label: 'List only — audit pasted/uploaded URLs' },
          { value: 'sitemap', label: 'Sitemap only — no link following' },
          { value: 'hybrid', label: 'Hybrid — spider + sitemap + list' },
        ],
        help: 'Controls how URLs enter the crawl queue. List mode does not follow links.',
      },
      {
        key: 'crawl_url_list',
        label: 'URL list',
        type: 'textarea',
        defaultValue: '',
        span: 2,
        placeholder: 'https://example.com/page-a\nhttps://example.com/page-b',
        help: 'One URL per line (or comma-separated). Required for List mode; optional for Hybrid.',
        visibleWhen: { key: 'crawl_discovery_mode', not: ['spider', 'sitemap'] },
      },
      {
        key: 'crawl_user_agent_preset',
        label: 'Crawl user-agent preset',
        type: 'select',
        defaultValue: 'default',
        options: [
          { value: 'default', label: 'Default crawler UA' },
          { value: 'mobile', label: 'Mobile Safari' },
          { value: 'custom', label: 'Custom UA string' },
        ],
      },
      {
        key: 'crawl_user_agent_custom',
        label: 'Custom user-agent',
        type: 'text',
        defaultValue: '',
        visibleWhen: { key: 'crawl_user_agent_preset', not: ['default', 'mobile'] },
      },
      {
        key: 'crawl_auth_username',
        label: 'HTTP Basic auth username',
        type: 'text',
        defaultValue: '',
      },
      {
        key: 'crawl_auth_password',
        label: 'HTTP Basic auth password',
        type: 'text',
        defaultValue: '',
      },
      {
        key: 'crawl_extra_headers',
        label: 'Extra request headers',
        type: 'textarea',
        defaultValue: '',
        help: 'One header per line: Name: value',
      },
      {
        key: 'crawl_cookies',
        label: 'Cookie header value',
        type: 'text',
        defaultValue: '',
      },
      {
        key: 'crawl_robots_txt_override',
        label: 'Robots.txt override',
        type: 'textarea',
        defaultValue: '',
        help: 'Paste robots.txt rules for staging crawls instead of fetching live robots.txt.',
      },
      {
        key: 'custom_extractors',
        label: 'Custom extractors (JSON)',
        type: 'textarea',
        defaultValue: '',
        span: 2,
        help: 'JSON array: [{\"name\":\"sku\",\"type\":\"css\",\"selector\":\"[data-sku]\",\"attr\":\"data-sku\"}]',
      },
      { key: 'max_pages', label: 'Crawl limit (URLs)', type: 'number', defaultValue: '500' },
      {
        key: 'concurrency',
        label: 'Concurrent requests',
        type: 'number',
        defaultValue: '8',
        help: 'How many pages to fetch in parallel. Higher is faster but heavier on the target server.',
      },
      {
        key: 'timeout',
        label: 'Timeout (s)',
        type: 'number',
        defaultValue: '12',
        help: 'Seconds to wait for each page before giving up.',
      },
      {
        key: 'max_depth',
        label: 'Crawl depth',
        type: 'number',
        defaultValue: '6',
        help: 'How many link-hops from the start URL to follow.',
      },
      { key: 'polite_delay', label: 'Crawl delay (seconds)', type: 'float', defaultValue: '0.2' },
      { key: 'ignore_robots', label: 'Ignore robots.txt', type: 'bool', defaultValue: false },
      { key: 'allow_external', label: 'Allow external links', type: 'bool', defaultValue: false },
      { key: 'store_outlinks', label: 'Store external links', type: 'bool', defaultValue: true },
      { key: 'store_content_excerpt', label: 'Store page text excerpt', type: 'bool', defaultValue: true },
      { key: 'content_excerpt_max_chars', label: 'Excerpt max chars', type: 'number', defaultValue: '4096' },
      {
        key: 'store_page_html',
        label: 'Store raw page HTML',
        type: 'bool',
        defaultValue: false,
        help: 'Persist fetched HTML per URL in the database for later content analysis. Increases DB size; does not affect CSV exports.',
      },
      {
        key: 'max_stored_html_bytes',
        label: 'Max stored HTML per page (bytes)',
        type: 'number',
        defaultValue: '2097152',
        help: 'Skip pages whose HTML exceeds this size (default 2 MB). Only applies when store_page_html is enabled.',
      },
      {
        key: 'run_content_analysis',
        label: 'Run content analysis step',
        type: 'bool',
        defaultValue: false,
        help: 'After crawl, analyze stored HTML and update word counts/keywords in crawl results. Requires store_page_html.',
      },
      {
        key: 'content_analysis_strategy',
        label: 'Content analysis strategy',
        type: 'select',
        defaultValue: 'main_only',
        options: [
          { value: 'main_only', label: 'Main content only (main/article)' },
          { value: 'full_body', label: 'Full body text' },
        ],
        help: 'How to select page text when analyzing stored HTML.',
      },
      {
        key: 'content_analysis_workers',
        label: 'Content analysis workers',
        type: 'number',
        defaultValue: '4',
        help: 'Parallel workers for the post-crawl content analysis step.',
      },
      {
        key: 'custom_extraction_regex',
        label: 'Custom extraction regex',
        type: 'text',
        defaultValue: '',
        help: 'Optional regex with one capture group; stored per URL in crawl data and Links CSV export.',
        placeholder: 'data-product-id="([^"]+)"',
      },
      {
        key: 'crawl_path_segments',
        label: 'Crawl path segments (prefixes)',
        type: 'text',
        defaultValue: '',
        help: 'Comma-separated path prefixes for per-segment health scores (e.g. /blog,/products).',
        placeholder: '/blog,/docs',
      },
      {
        key: 'crawl_ignore_params',
        label: 'Ignore query parameters',
        type: 'text',
        defaultValue: '',
        help: 'Extra query param names to strip during crawl (utm_* and common facets are always stripped).',
        placeholder: 'ref,session',
      },
      {
        key: 'competitor_domains',
        label: 'Competitor domains (link gap)',
        type: 'text',
        defaultValue: '',
        help: 'Comma-separated competitor root domains for GSC Links gap analysis.',
        placeholder: 'competitor.com,rival.io',
      },
      {
        key: 'export_logo_url',
        label: 'White-label export logo URL',
        type: 'url',
        defaultValue: '',
        help: 'Optional logo URL for HTML/PDF audit exports.',
        placeholder: 'https://agency.com/logo.png',
      },
      {
        key: 'preserve_crawl_history',
        label: 'Keep crawl history',
        type: 'bool',
        defaultValue: true,
        help: 'When true, new crawls append to the database. When false, crawl tables are replaced but reports, Google, and keyword history are preserved.',
      },
      {
        key: 'crawl_stream_to_db',
        label: 'Stream crawl to database while running',
        type: 'bool',
        defaultValue: false,
        help: 'When true (or when max_pages > 100), pages are batch-written during the crawl instead of at the end.',
      },
      {
        key: 'crawl_exclude_urls',
        label: 'Exclude URLs (comma-separated patterns)',
        type: 'textarea',
        defaultValue: '',
        help: 'Comma-separated URL substrings or patterns to exclude from crawling.',
      },
      {
        key: 'crawl_render_mode',
        label: 'Crawl rendering',
        type: 'singleselect',
        defaultValue: 'static',
        options: [
          { value: 'static', label: 'Static HTML (fast)' },
          { value: 'javascript', label: 'JavaScript rendering (slow)' },
          { value: 'auto', label: 'Auto (static, JS when needed)' },
        ],
        help: 'JavaScript mode uses headless Chromium for React, Vue, Next.js, and Shopify themes. Roughly 10–20× slower than static.',
      },
      {
        key: 'crawl_js_concurrency',
        label: 'JS parallel pages',
        type: 'number',
        defaultValue: '3',
        help: 'Parallel browser page slots when JavaScript rendering is enabled. HTTP concurrency is ignored in JS mode.',
        visibleWhen: JS_FIELD_VISIBLE_WHEN,
      },
      {
        key: 'crawl_js_timeout',
        label: 'JS navigation timeout (s)',
        type: 'number',
        defaultValue: '30',
        visibleWhen: JS_FIELD_VISIBLE_WHEN,
      },
      {
        key: 'crawl_js_wait_until',
        label: 'JS wait until',
        type: 'select',
        defaultValue: 'domcontentloaded',
        visibleWhen: JS_FIELD_VISIBLE_WHEN,
        options: [
          { value: 'domcontentloaded', label: 'DOM content loaded' },
          { value: 'load', label: 'Full load' },
          { value: 'commit', label: 'First commit' },
        ],
      },
      {
        key: 'crawl_js_extra_wait_ms',
        label: 'JS hydration wait (ms)',
        type: 'number',
        defaultValue: '1500',
        help: 'Extra wait after load for client-side hydration before capturing HTML.',
        visibleWhen: JS_FIELD_VISIBLE_WHEN,
      },
      {
        key: 'crawl_js_block_resources',
        label: 'Block images/fonts in JS crawl',
        type: 'bool',
        defaultValue: true,
        help: 'Blocks images, fonts, and media during JS crawl for faster rendering.',
        visibleWhen: JS_FIELD_VISIBLE_WHEN,
      },
      {
        key: 'crawl_js_capture_console',
        label: 'Capture browser console during JS crawl',
        type: 'bool',
        defaultValue: true,
        help: 'Records console.error and console.warning messages while pages load in headless Chromium.',
        visibleWhen: JS_FIELD_VISIBLE_WHEN,
      },
      {
        key: 'crawl_js_console_levels',
        label: 'Console levels to capture',
        type: 'text',
        defaultValue: 'error,warning',
        help: 'Comma-separated console levels (e.g. error, warning, info).',
        visibleWhen: JS_FIELD_VISIBLE_WHEN,
      },
      {
        key: 'crawl_js_capture_failed_requests',
        label: 'Capture failed network requests',
        type: 'bool',
        defaultValue: false,
        help: 'Records failed XHR/fetch during JS crawl (can be noisy).',
        visibleWhen: JS_FIELD_VISIBLE_WHEN,
      },
      {
        key: 'crawl_js_console_max_per_page',
        label: 'Max console entries per page',
        type: 'number',
        defaultValue: '20',
        help: 'Cap on console messages, page errors, and failed requests stored per URL.',
        visibleWhen: JS_FIELD_VISIBLE_WHEN,
      },
    ],
  },
  {
    id: 'report',
    label: 'Audit report',
    fields: [
      { key: 'outbound_domain_max_rows', label: 'Outbound domain max rows', type: 'number', defaultValue: '200' },
      { key: 'include_keyword_opportunities', label: 'Include keyword opportunities', type: 'bool', defaultValue: true },
      {
        key: 'site_name',
        label: 'Property / client name',
        type: 'text',
        required: true,
        defaultValue: 'Site',
        placeholder: 'example.com',
        help: 'Required. Shown in audit titles and exports; auto-filled from Site URL when you set it.',
      },
      { key: 'report_title', label: 'Audit title', type: 'text', defaultValue: 'SEO audit' },
      { key: 'max_fetch_for_edges', label: 'Max URLs for link graph', type: 'number', defaultValue: '300' },
      { key: 'same_domain_only', label: 'Same domain only', type: 'bool', defaultValue: true },
      { key: 'max_nodes_plot', label: 'Max nodes (plot)', type: 'number', defaultValue: '400' },
      { key: 'run_security_scan', label: 'Security checks (headers)', type: 'bool', defaultValue: true },
      {
        key: 'security_scan_active',
        label: 'Active security probes',
        type: 'bool',
        defaultValue: false,
        help: 'Authorized testing only. Sends controlled probes beyond passive header checks.',
      },
      { key: 'security_max_urls_probe', label: 'Security max URLs to probe', type: 'number', defaultValue: '20' },
      {
        key: 'probe_image_inventory',
        label: 'Probe image URLs (size/MIME)',
        type: 'bool',
        defaultValue: false,
        help: 'HEAD/GET discovered image URLs during report build for largest/unoptimized image tools.',
      },
      { key: 'max_image_probe_urls', label: 'Max image URLs to probe', type: 'number', defaultValue: '500' },
      { key: 'image_probe_concurrency', label: 'Image probe concurrency', type: 'number', defaultValue: '6' },
      { key: 'image_probe_timeout', label: 'Image probe timeout (seconds)', type: 'number', defaultValue: '8' },
      { key: 'image_unoptimized_min_kb', label: 'Unoptimized image min size (KB)', type: 'number', defaultValue: '200' },
      {
        key: 'enable_subdomain_discovery',
        label: 'Subdomain discovery',
        type: 'bool',
        defaultValue: true,
        help: 'Build passive subdomain inventory from crawl, GSC, and certificate transparency.',
      },
      {
        key: 'subdomain_ct_lookup',
        label: 'Certificate transparency lookup',
        type: 'bool',
        defaultValue: true,
        help: 'Query crt.sh when subdomain discovery is enabled.',
      },
      {
        key: 'enable_rdap_org_lookup',
        label: 'RDAP organization lookup',
        type: 'bool',
        defaultValue: true,
        help: 'Fetch registrant org name for contact intelligence (best-effort).',
      },
    ],
  },
  {
    id: 'lighthouse',
    label: 'Performance (Lighthouse)',
    fields: [
      {
        key: 'lighthouse_url',
        label: 'Lighthouse test URL',
        type: 'url',
        defaultValue: '',
        placeholder: 'https://example.com',
        help: 'Optional; falls back to Start URL for single-URL Lighthouse runs.',
      },
      {
        key: 'lighthouse_mode',
        label: 'Mode',
        type: 'singleselect',
        span: 1 as const,
        defaultValue: 'navigation',
        options: [
          { value: 'navigation', label: 'Navigation' },
          { value: 'timespan', label: 'Timespan' },
          { value: 'snapshot', label: 'Snapshot' },
        ],
        help:
          'Navigation: full performance audit via CLI. Snapshot: page-state audit (accessibility/best-practices; limited performance). Timespan: post-load window using crawl_js_extra_wait_ms.',
      },
      {
        key: 'lighthouse_strategy',
        label: 'Strategy',
        type: 'singleselect',
        span: 1 as const,
        defaultValue: 'desktop',
        options: [
          { value: 'desktop', label: 'Desktop' },
          { value: 'mobile', label: 'Mobile' },
        ],
      },
      {
        key: 'lighthouse_categories',
        label: 'Categories',
        type: 'multiselect',
        defaultValue: 'performance,accessibility,best-practices,seo',
        options: [
          { value: 'performance', label: 'Performance' },
          { value: 'accessibility', label: 'Accessibility' },
          { value: 'best-practices', label: 'Best practices' },
          { value: 'seo', label: 'SEO' },
          { value: 'pwa', label: 'PWA' },
        ],
      },
      { key: 'lighthouse_iterations', label: 'Iterations', type: 'number', defaultValue: '1' },
      { key: 'run_lighthouse', label: 'Run single-URL Lighthouse', type: 'bool', defaultValue: true },
      { key: 'run_lighthouse_on_pages', label: 'Run Lighthouse on crawled pages', type: 'bool', defaultValue: true },
      { key: 'enable_crux', label: 'Fetch CrUX field Core Web Vitals', type: 'bool', defaultValue: false, help: 'Uses Chrome UX Report API for real-user LCP, INP, CLS at origin level.' },
      { key: 'enable_rich_results_validation', label: 'Validate structured data (Rich Results)', type: 'bool', defaultValue: false },
      {
        key: 'google_rich_results_api_key',
        label: 'Google Rich Results API key',
        type: 'text',
        defaultValue: '',
        help: 'Optional API key for Rich Results Test API when GSC OAuth is unavailable.',
        placeholder: 'AIza…',
      },
      {
        key: 'enable_axe',
        label: 'Run axe accessibility scan (browser crawl)',
        type: 'bool',
        defaultValue: false,
        help: 'Requires crawl_render_mode javascript or auto. No-op on static-only crawls.',
      },
      { key: 'enable_spell_check', label: 'Spell-check page excerpts', type: 'bool', defaultValue: false },
      { key: 'enable_html_validation', label: 'Basic HTML validation warnings', type: 'bool', defaultValue: false },
      { key: 'enable_amp_audit', label: 'AMP canonical pairing audit', type: 'bool', defaultValue: false },
      { key: 'enable_wayback_lookup', label: 'Wayback lookup for 404 URLs', type: 'bool', defaultValue: false },
      { key: 'lighthouse_max_pages', label: 'Performance sample size (URLs)', type: 'number', defaultValue: '2' },
      { key: 'lighthouse_concurrency', label: 'Lighthouse parallel URLs', type: 'number', defaultValue: '2' },
    ],
  },
  {
    id: 'analysis',
    label: 'Content analysis',
    fields: [
      { key: 'enable_duplicate_detection', label: 'Near-duplicate detection', type: 'bool', defaultValue: true },
      { key: 'enable_language_detection', label: 'Language detection', type: 'bool', defaultValue: true },
      { key: 'analysis_fuzzy_threshold', label: 'Near-duplicate similarity (%)', type: 'number', defaultValue: '92' },
      { key: 'analysis_simhash_hamming', label: 'Near-duplicate hash distance', type: 'number', defaultValue: '0' },
      { key: 'analysis_simhash_max_urls', label: 'Max URLs for SimHash duplicate pass', type: 'number', defaultValue: '800' },
      { key: 'analysis_fuzzy_max_urls', label: 'Max URLs for fuzzy duplicate pass', type: 'number', defaultValue: '600' },
      { key: 'analysis_dup_max_pages', label: 'Max pages for duplicate scan', type: 'number', defaultValue: '2000' },
    ],
  },
  {
    id: 'pipeline',
    label: 'Audit steps',
    fields: [
      { key: 'run_crawl', label: 'Run crawl', type: 'bool', defaultValue: true },
      { key: 'run_report', label: 'Build site audit', type: 'bool', defaultValue: true },
      { key: 'run_plot', label: 'Build crawl charts', type: 'bool', defaultValue: true },
    ],
  },
  {
    id: 'google',
    label: 'Search Console & Analytics',
    fields: [
      {
        key: 'enable_google_search_console',
        label: 'Fetch Google Search Console',
        type: 'bool',
        span: 1 as const,
        defaultValue: false,
        help: 'Requires Google connection configured in Integrations above.',
      },
      {
        key: 'enable_google_analytics',
        label: 'Fetch Google Analytics 4',
        type: 'bool',
        span: 1 as const,
        defaultValue: false,
      },
      {
        key: 'google_date_range_days',
        label: 'Date range (days)',
        type: 'number',
        span: 1 as const,
        defaultValue: '28',
      },
      {
        key: 'google_url_gap_list_limit',
        label: 'URL gap list cap',
        type: 'number',
        defaultValue: '200',
        placeholder: '200',
        unit: 'rows',
        help: 'Maximum rows shown for each gap list (pages only in crawl, only in Search Console, or only in Analytics).',
      },
      {
        key: 'bing_webmaster_api_key',
        label: 'Bing Webmaster API key',
        type: 'text',
        defaultValue: '',
        help: 'Optional. Fetches Bing backlinks summary on audit build and via Integrations sync.',
        placeholder: 'Bing API key',
      },
      {
        key: 'serp_api_key',
        label: 'SerpAPI key (keyword SERP overlay)',
        type: 'text',
        defaultValue: '',
        help: 'Optional. Adds Estimated SERP competition signals to top keywords during enrichment.',
        placeholder: 'SerpAPI key',
      },
      {
        key: 'enrich_keywords_after_report',
        label: 'Run keyword research after audit',
        type: 'tristate',
        defaultValue: 'auto',
        options: [
          { value: 'auto', label: 'Auto' },
          { value: 'true', label: 'Yes' },
          { value: 'false', label: 'No' },
        ],
        help: 'Auto follows the Search Console toggle above. Yes and No override it.',
      },
    ],
  },
  {
    id: 'keywords_basics',
    label: 'Basics',
    fields: [
      {
        key: 'keyword_max_pages',
        label: 'Keyword max pages',
        type: 'number',
        defaultValue: '200',
        unit: 'pages',
        help: 'Max crawled pages used when extracting on-site keywords during the audit.',
      },
      {
        key: 'keyword_gsc_max_rows',
        label: 'Search Console max rows',
        type: 'number',
        defaultValue: '25000',
        unit: 'rows',
        help: 'Maximum keyword rows to fetch from Search Console (paginated).',
      },
      {
        key: 'brand_name',
        label: 'Brand / client name',
        type: 'text',
        span: 2 as const,
        defaultValue: '',
        placeholder: 'e.g. Acme Corp',
        help: 'Classifies branded vs non-branded keywords. Falls back to the site hostname when empty.',
      },
      {
        key: 'keyword_seeds',
        label: 'Seed keywords',
        type: 'textarea',
        span: 2 as const,
        defaultValue: '',
        placeholder: 'seo audit, content strategy',
        help: 'Optional comma-separated seeds always included in Suggest expansion batches.',
      },
    ],
  },
  {
    id: 'keywords_expansion',
    label: 'Expansion',
    fields: [
      {
        key: 'enable_google_suggest',
        label: 'Google Suggest',
        type: 'bool',
        defaultValue: false,
        help: 'Expand seed keywords using Google Autocomplete (free, no auth).',
      },
      {
        key: 'enable_google_trends',
        label: 'Google Trends direction',
        type: 'bool',
        defaultValue: false,
        help: 'Adds trend direction (up/down/flat) via pytrends. Requires pip install pytrends; can be flaky.',
      },
      {
        key: 'enable_wikipedia_topic',
        label: 'Wikipedia parent topic',
        type: 'bool',
        defaultValue: false,
        help: 'Fetches parent topic from Wikipedia for top keywords (~1s delay per keyword).',
      },
      {
        key: 'enable_datamuse',
        label: 'Datamuse semantic expansion',
        type: 'bool',
        defaultValue: false,
        help: 'Adds related keywords via datamuse.com (free, no auth).',
      },
      {
        key: 'keyword_suggest_top_n',
        label: 'Suggest seeds (top N site keywords)',
        type: 'number',
        defaultValue: '20',
        unit: 'keywords',
        help: 'How many top site keywords to use as Suggest seeds when expansion is enabled.',
      },
      {
        key: 'keyword_max_suggest_results',
        label: 'Max Suggest results per seed',
        type: 'number',
        defaultValue: '8',
        unit: 'results',
      },
    ],
  },
  {
    id: 'advanced',
    label: 'Advanced',
    fields: [
      {
        key: 'warning_mapper_input',
        label: 'Warning mapper input file (optional)',
        type: 'text',
        defaultValue: '',
        help: 'Optional path to Lighthouse/axe/list JSON. Leave blank to use the latest Lighthouse run from PostgreSQL.',
      },
      {
        key: 'warning_mapper_input_type',
        label: 'Warning mapper input type',
        type: 'text',
        defaultValue: 'lighthouse',
        help: 'Input type: lighthouse (default, from DB), axe, or list. axe/list require a file path.',
      },
    ],
  },
];

// ─── Field tiering & subgrouping ────────────────────────────────────────────────
// Render-time only: controls which fields show up-front vs. behind an "Advanced
// options" disclosure, and how dense sections are grouped into labeled blocks.
// Does NOT affect serialization, validation, or field order. Default tier = basic.

const ADVANCED_FIELD_KEYS = new Set<string>([
  // Crawl
  'crawl_user_agent_preset', 'crawl_user_agent_custom', 'crawl_auth_username', 'crawl_auth_password',
  'crawl_extra_headers', 'crawl_cookies', 'crawl_robots_txt_override', 'custom_extractors',
  'polite_delay', 'store_outlinks', 'store_content_excerpt', 'content_excerpt_max_chars',
  'store_page_html', 'max_stored_html_bytes', 'run_content_analysis', 'content_analysis_strategy',
  'content_analysis_workers', 'custom_extraction_regex', 'crawl_path_segments', 'crawl_ignore_params',
  'competitor_domains', 'export_logo_url', 'crawl_stream_to_db', 'crawl_exclude_urls',
  'crawl_js_concurrency', 'crawl_js_timeout', 'crawl_js_wait_until', 'crawl_js_extra_wait_ms',
  'crawl_js_block_resources', 'crawl_js_capture_console', 'crawl_js_console_levels',
  'crawl_js_capture_failed_requests', 'crawl_js_console_max_per_page',
  // Report
  'outbound_domain_max_rows', 'max_fetch_for_edges', 'same_domain_only', 'max_nodes_plot',
  'security_scan_active', 'security_max_urls_probe', 'probe_image_inventory', 'max_image_probe_urls',
  'image_probe_concurrency', 'image_probe_timeout', 'image_unoptimized_min_kb', 'subdomain_ct_lookup',
  'enable_rdap_org_lookup',
  // Lighthouse
  'lighthouse_iterations', 'enable_crux', 'enable_rich_results_validation', 'google_rich_results_api_key',
  'enable_axe', 'enable_spell_check', 'enable_html_validation', 'enable_amp_audit', 'enable_wayback_lookup',
  'lighthouse_max_pages', 'lighthouse_concurrency',
  // Content analysis
  'analysis_fuzzy_threshold', 'analysis_simhash_hamming', 'analysis_simhash_max_urls',
  'analysis_fuzzy_max_urls', 'analysis_dup_max_pages',
  // Google
  'google_url_gap_list_limit', 'bing_webmaster_api_key', 'serp_api_key',
  // Keywords
  'keyword_max_pages', 'keyword_gsc_max_rows', 'keyword_suggest_top_n', 'keyword_max_suggest_results',
]);

const FIELD_SUBGROUP: Record<string, string> = {
  // Scope & limits
  start_url: 'scope', crawl_discovery_mode: 'scope', crawl_url_list: 'scope', crawl_render_mode: 'scope',
  max_pages: 'scope', max_depth: 'scope', concurrency: 'scope', timeout: 'scope', polite_delay: 'scope',
  ignore_robots: 'scope', allow_external: 'scope', crawl_exclude_urls: 'scope', crawl_ignore_params: 'scope',
  crawl_path_segments: 'scope',
  // JavaScript rendering
  crawl_js_concurrency: 'js', crawl_js_timeout: 'js', crawl_js_wait_until: 'js', crawl_js_extra_wait_ms: 'js',
  crawl_js_block_resources: 'js', crawl_js_capture_console: 'js', crawl_js_console_levels: 'js',
  crawl_js_capture_failed_requests: 'js', crawl_js_console_max_per_page: 'js',
  // Authentication & headers
  crawl_user_agent_preset: 'auth', crawl_user_agent_custom: 'auth', crawl_auth_username: 'auth',
  crawl_auth_password: 'auth', crawl_extra_headers: 'auth', crawl_cookies: 'auth',
  crawl_robots_txt_override: 'auth',
  // Content storage & extraction
  store_page_html: 'storage', max_stored_html_bytes: 'storage', store_content_excerpt: 'storage',
  content_excerpt_max_chars: 'storage', store_outlinks: 'storage', run_content_analysis: 'storage',
  content_analysis_strategy: 'storage', content_analysis_workers: 'storage', custom_extractors: 'storage',
  custom_extraction_regex: 'storage',
  // Output & history
  preserve_crawl_history: 'output', crawl_stream_to_db: 'output', competitor_domains: 'output',
  export_logo_url: 'output',
};

/** Effective tier for a field (per-field override wins, else the central table). */
export function fieldTier(field: PipelineConfigField): FieldTier {
  if (field.tier) return field.tier;
  return ADVANCED_FIELD_KEYS.has(field.key) ? 'advanced' : 'basic';
}

/** Effective subgroup id for a field (per-field override wins, else the central table). */
export function fieldSubgroup(field: PipelineConfigField): string | undefined {
  return field.group ?? FIELD_SUBGROUP[field.key];
}

/** Split fields into basic vs. advanced, preserving order. */
export function partitionFieldsByTier(fields: PipelineConfigField[]): {
  basic: PipelineConfigField[];
  advanced: PipelineConfigField[];
} {
  const basic: PipelineConfigField[] = [];
  const advanced: PipelineConfigField[] = [];
  for (const f of fields) {
    if (fieldTier(f) === 'advanced') advanced.push(f);
    else basic.push(f);
  }
  return { basic, advanced };
}

export interface PipelineFieldGroup {
  id: string;
  label: string | null;
  fields: PipelineConfigField[];
}

/**
 * Group fields into the ordered subgroups defined on the section. Ungrouped
 * fields (or sections without subgroups) collapse into a single leading
 * null-label bucket so callers can render them as a plain grid. Order-stable.
 */
export function groupFieldsBySubgroup(
  section: PipelineConfigSection,
  fields: PipelineConfigField[],
): PipelineFieldGroup[] {
  const subgroups = section.subgroups;
  if (!subgroups || subgroups.length === 0) {
    return fields.length ? [{ id: '_all', label: null, fields }] : [];
  }
  const buckets = new Map<string, PipelineConfigField[]>();
  const ungrouped: PipelineConfigField[] = [];
  for (const f of fields) {
    const sub = fieldSubgroup(f);
    if (sub && subgroups.some((g) => g.id === sub)) {
      const arr = buckets.get(sub) ?? [];
      arr.push(f);
      buckets.set(sub, arr);
    } else {
      ungrouped.push(f);
    }
  }
  const out: PipelineFieldGroup[] = [];
  if (ungrouped.length) out.push({ id: '_ungrouped', label: null, fields: ungrouped });
  for (const g of subgroups) {
    const arr = buckets.get(g.id);
    if (arr && arr.length) out.push({ id: g.id, label: g.label, fields: arr });
  }
  return out;
}

// ─── Derived helpers ──────────────────────────────────────────────────────────

/** Written by the server on audit run; not shown in the settings UI. */
export const INTERNAL_PIPELINE_KEYS: readonly string[] = ['active_property_id'];

/** Set of all schema-defined keys (for validation / unknown-key detection). */
export const ALL_SCHEMA_KEYS = new Set([
  ...PIPELINE_CONFIG_SECTIONS.flatMap((s) => s.fields.map((f) => f.key)),
  ...INTERNAL_PIPELINE_KEYS,
]);

/**
 * Look up a field descriptor by key.
 * @param {string} key
 * @returns {object | undefined}
 */
export function getFieldByKey(key: string): PipelineConfigField | undefined {
  for (const section of PIPELINE_CONFIG_SECTIONS) {
    const f = section.fields.find((field) => field.key === key);
    if (f) return f;
  }
  return undefined;
}

/** Whether a field should be shown given current config state (visibleWhen rules). */
export function isPipelineFieldVisible(
  field: PipelineConfigField,
  state: Record<string, string | boolean | undefined>,
): boolean {
  const rule = field.visibleWhen;
  if (!rule) return true;
  const raw = state[rule.key];
  const value = raw === undefined || raw === null ? '' : String(raw).trim().toLowerCase();
  if (rule.not?.length) {
    return !rule.not.some((excluded) => excluded.toLowerCase() === value);
  }
  return true;
}

function isTruthyPipelineBool(
  value: string | boolean | undefined,
  defaultWhenUnset = false,
): boolean {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return defaultWhenUnset;
}

export interface ValidatePipelineRunInput {
  state: PipelineConfigState;
  command?: string | null;
  browserStatus?: BrowserCrawlStatus | null;
}

function runIncludesCrawl(state: PipelineConfigState, command: string | null | undefined): boolean {
  if (command === 'crawl') return true;
  if (command === 'report' || command === 'keywords' || command === 'lighthouse') return false;
  if (!command) return isTruthyPipelineBool(state?.run_crawl, true);
  return false;
}

/** Validate schema fields marked `required`. */
export function validateRequiredPipelineFields(state: PipelineConfigState): string[] {
  const errors: string[] = [];
  for (const section of PIPELINE_CONFIG_SECTIONS) {
    for (const f of section.fields) {
      if (!f.required || f.type === 'bool') continue;
      const raw = state[f.key];
      const value = raw == null ? '' : String(raw).trim();
      if (!value) {
        errors.push(`${f.label} is required. Enter it in Audit settings before continuing.`);
      }
    }
  }
  return errors;
}

/**
 * Validate config before starting a pipeline job.
 * @returns error messages (empty if ok)
 */
export function validatePipelineRun({
  state,
  command = null,
  browserStatus = null,
}: ValidatePipelineRunInput): string[] {
  const startUrl = String(state?.start_url ?? '').trim();
  const lighthouseUrl = String(state?.lighthouse_url ?? '').trim();
  const errors: string[] = [];

  const needsStartUrl =
    command === 'crawl' ||
    command === 'report' ||
    command === 'keywords' ||
    (!command &&
      (isTruthyPipelineBool(state?.run_crawl, true) || isTruthyPipelineBool(state?.run_report, true)));

  const needsReportFields =
    command === 'report' ||
    (!command && isTruthyPipelineBool(state?.run_report, true));

  const needsLighthouseUrl =
    command === 'lighthouse' ||
    (!command && isTruthyPipelineBool(state?.run_lighthouse, false) && !isTruthyPipelineBool(state?.run_lighthouse_on_pages, false));

  if (needsStartUrl && !startUrl) {
    errors.push('Start URL is required. Enter the site URL in Run audit before running.');
  }
  if (needsReportFields) {
    errors.push(...validateRequiredPipelineFields(state));
  }
  if (needsLighthouseUrl && !lighthouseUrl && !startUrl) {
    errors.push('Lighthouse URL or Start URL is required for single-URL Lighthouse.');
  }
  if (
    runIncludesCrawl(state, command) &&
    crawlRenderModeUsesBrowser(state) &&
    browserStatus != null &&
    !browserStatus.ok
  ) {
    errors.push(browserStatus.message?.trim() || BROWSER_CRAWL_UNAVAILABLE_MSG);
  }
  const discovery = String(state?.crawl_discovery_mode ?? 'spider').trim().toLowerCase();
  const urlList = String(state?.crawl_url_list ?? '').trim();
  if (runIncludesCrawl(state, command) && discovery === 'list' && !urlList) {
    errors.push('URL list is required when discovery mode is List. Paste URLs in Audit settings.');
  }
  return errors;
}

export function buildInitialPipelineConfigState(): PipelineConfigState {
  const out: PipelineConfigState = {};
  for (const section of PIPELINE_CONFIG_SECTIONS) {
    for (const f of section.fields) {
      if (f.type === 'bool') {
        out[f.key] = f.defaultValue as boolean;
      } else if (f.type === 'tristate') {
        out[f.key] = (f.defaultValue ?? 'auto') as string;
      } else {
        out[f.key] = String(f.defaultValue ?? '');
      }
    }
  }
  return out;
}

/**
 * Serialize state to `key = value` text.
 * Tri-state 'auto' values are omitted entirely (Python uses its own default).
 * Re-exported from pipelineConfig.js as serializeConfig; this version is kept
 * for backward compatibility when no unknownKeys are involved.
 *
 * @param {Record<string, string | boolean>} state
 * @returns {string}
 */
export function serializePipelineConfig(state: PipelineConfigState): string {
  const lines = [
    '# Site Audit config (managed by web UI)',
    '# key = value; comments start with #.',
    '',
  ];
  const seenIds = new Set();
  for (const section of PIPELINE_CONFIG_SECTIONS) {
    if (seenIds.has(section.id)) continue;
    seenIds.add(section.id);
    lines.push(`# --- ${section.label} ---`);
    for (const f of section.fields) {
      const v = state[f.key];
      if (f.type === 'bool') {
        lines.push(`${f.key} = ${v === true ? 'true' : 'false'}`);
      } else if (f.type === 'tristate') {
        if (v === 'auto' || v == null) continue;
        lines.push(`${f.key} = ${v === 'true' ? 'true' : 'false'}`);
      } else {
        const s = v == null ? '' : String(v);
        lines.push(`${f.key} = ${s}`);
      }
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}
