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
  'JavaScript crawl requires Playwright and Chromium. Install: pip install -r requirements-browser.txt. Chrome or Chromium must be on PATH or set CHROME_PATH.';

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
  visibleWhen?: { key: string; not?: readonly string[] };
}

const JS_FIELD_VISIBLE_WHEN = { key: 'crawl_render_mode', not: ['static'] as const };

export interface PipelineConfigSection {
  id: string;
  label: string;
  fields: PipelineConfigField[];
}

export const PIPELINE_CONFIG_SECTIONS: PipelineConfigSection[] = [
  {
    id: 'crawl',
    label: 'Crawl',
    fields: [
      {
        key: 'start_url',
        label: 'Site URL',
        type: 'url',
        defaultValue: '',
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
      { key: 'concurrency', label: 'Concurrent requests', type: 'number', defaultValue: '8' },
      { key: 'timeout', label: 'Timeout (s)', type: 'number', defaultValue: '12' },
      { key: 'max_depth', label: 'Crawl depth', type: 'number', defaultValue: '6' },
      { key: 'polite_delay', label: 'Crawl delay (seconds)', type: 'float', defaultValue: '0.2' },
      { key: 'ignore_robots', label: 'Ignore robots.txt', type: 'bool', defaultValue: false },
      { key: 'allow_external', label: 'Allow external links', type: 'bool', defaultValue: false },
      { key: 'store_outlinks', label: 'Store external links', type: 'bool', defaultValue: true },
      { key: 'store_content_excerpt', label: 'Store page text excerpt', type: 'bool', defaultValue: true },
      { key: 'content_excerpt_max_chars', label: 'Excerpt max chars', type: 'number', defaultValue: '4096' },
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
