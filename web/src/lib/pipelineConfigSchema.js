/**
 * Pipeline config keys for the runner UI (see input.txt.example for reference).
 * Serialized as `key = value` lines for `python -m src --config`.
 *
 * Field types:
 *   bool      – checkbox (true/false)
 *   tristate  – select: 'auto' | 'true' | 'false' (auto = omit key from file)
 *   number    – integer text input
 *   float     – decimal text input
 *   text      – single-line text input
 *   textarea  – multi-line text input
 */

export const PIPELINE_CONFIG_SECTIONS = [
  {
    id: 'crawl',
    label: 'Crawl',
    fields: [
      {
        key: 'start_url',
        label: 'Start URL',
        type: 'text',
        defaultValue: '',
        placeholder: 'https://example.com',
        help: 'Required before running a crawl or report. Enter the site to analyze.',
      },
      { key: 'max_pages', label: 'Max pages', type: 'number', defaultValue: '20' },
      { key: 'concurrency', label: 'Concurrency', type: 'number', defaultValue: '8' },
      { key: 'timeout', label: 'Timeout (s)', type: 'number', defaultValue: '12' },
      { key: 'max_depth', label: 'Max depth', type: 'number', defaultValue: '6' },
      { key: 'polite_delay', label: 'Polite delay (s)', type: 'float', defaultValue: '0.2' },
      { key: 'ignore_robots', label: 'Ignore robots.txt', type: 'bool', defaultValue: false },
      { key: 'allow_external', label: 'Allow external links', type: 'bool', defaultValue: false },
      { key: 'store_outlinks', label: 'Store outlinks', type: 'bool', defaultValue: true },
      { key: 'store_content_excerpt', label: 'Store content excerpt', type: 'bool', defaultValue: true },
      { key: 'content_excerpt_max_chars', label: 'Excerpt max chars', type: 'number', defaultValue: '4096' },
      { key: 'sqlite_db', label: 'SQLite DB file', type: 'text', defaultValue: 'report.db' },
      {
        key: 'preserve_crawl_history',
        label: 'Append crawls (do not wipe DB)',
        type: 'bool',
        defaultValue: true,
        help: 'When true, new crawls append to report.db. When false, crawl tables are replaced but reports, Google, and keyword history are preserved.',
      },
      { key: 'crawl_output', label: 'Crawl output (JSON/CSV)', type: 'text', defaultValue: 'crawl_results.json' },
      {
        key: 'crawl_exclude_urls',
        label: 'Exclude URLs (comma-separated patterns)',
        type: 'textarea',
        defaultValue: '',
        help: 'Comma-separated URL substrings or patterns to exclude from crawling.',
      },
    ],
  },
  {
    id: 'report',
    label: 'Report',
    fields: [
      { key: 'outbound_domain_max_rows', label: 'Outbound domain max rows', type: 'number', defaultValue: '200' },
      { key: 'include_keyword_opportunities', label: 'Include keyword opportunities', type: 'bool', defaultValue: true },
      { key: 'crawl_csv', label: 'Crawl CSV/JSON path', type: 'text', defaultValue: 'crawl_results.json' },
      { key: 'edges_csv', label: 'Edges CSV', type: 'text', defaultValue: 'edges.json' },
      { key: 'nodes_csv', label: 'Nodes CSV', type: 'text', defaultValue: 'nodes.json' },
      { key: 'site_name', label: 'Site name', type: 'text', defaultValue: '' },
      { key: 'report_title', label: 'Report title', type: 'text', defaultValue: 'SEO report' },
      { key: 'report_output', label: 'Report output file', type: 'text', defaultValue: 'site_report.html' },
      { key: 'max_fetch_for_edges', label: 'Max fetch for edges', type: 'number', defaultValue: '300' },
      { key: 'same_domain_only', label: 'Same domain only', type: 'bool', defaultValue: true },
      { key: 'max_nodes_plot', label: 'Max nodes (plot)', type: 'number', defaultValue: '400' },
      { key: 'run_security_scan', label: 'Run security scan', type: 'bool', defaultValue: true },
      { key: 'security_scan_active', label: 'Security scan active (probes)', type: 'bool', defaultValue: false },
      { key: 'security_max_urls_probe', label: 'Security max URLs to probe', type: 'number', defaultValue: '20' },
      {
        key: 'security_findings_output',
        label: 'Security findings output file',
        type: 'text',
        defaultValue: '',
        help: 'Optional path to write security findings JSON. Leave blank to skip.',
      },
      {
        key: 'lighthouse_summary_json',
        label: 'Lighthouse summary JSON path',
        type: 'text',
        defaultValue: '',
        help: 'Optional: path to a pre-existing lighthouse_summary.json to include in the report.',
      },
    ],
  },
  {
    id: 'lighthouse',
    label: 'Lighthouse',
    fields: [
      {
        key: 'lighthouse_url',
        label: 'Lighthouse URL',
        type: 'text',
        defaultValue: '',
        placeholder: 'https://example.com',
        help: 'Optional; falls back to Start URL for single-URL Lighthouse runs.',
      },
      { key: 'lighthouse_mode', label: 'Mode', type: 'text', defaultValue: 'navigation' },
      { key: 'lighthouse_strategy', label: 'Strategy', type: 'text', defaultValue: 'desktop' },
      {
        key: 'lighthouse_categories',
        label: 'Categories (comma-separated)',
        type: 'text',
        defaultValue: 'performance,accessibility,best-practices,seo',
      },
      { key: 'lighthouse_iterations', label: 'Iterations', type: 'number', defaultValue: '1' },
      { key: 'lighthouse_output_dir', label: 'Output dir', type: 'text', defaultValue: '.' },
      { key: 'run_lighthouse', label: 'Run single-URL Lighthouse', type: 'bool', defaultValue: true },
      { key: 'run_lighthouse_on_pages', label: 'Run Lighthouse on crawled pages', type: 'bool', defaultValue: true },
      { key: 'lighthouse_max_pages', label: 'Lighthouse max pages', type: 'number', defaultValue: '2' },
    ],
  },
  {
    id: 'keywords_pipeline',
    label: 'Keywords',
    fields: [
      { key: 'keyword_output_dir', label: 'Keyword output dir', type: 'text', defaultValue: '.' },
      { key: 'keyword_max_pages', label: 'Keyword max pages', type: 'number', defaultValue: '200' },
    ],
  },
  {
    id: 'ml',
    label: 'ML',
    fields: [
      { key: 'enable_duplicate_detection', label: 'Duplicate detection', type: 'bool', defaultValue: true },
      { key: 'enable_anomaly_urls', label: 'Anomaly URLs', type: 'bool', defaultValue: true },
      { key: 'enable_language_detection', label: 'Language detection', type: 'bool', defaultValue: true },
      { key: 'enable_ner_spacy', label: 'NER (spaCy)', type: 'bool', defaultValue: true },
      { key: 'enable_semantic_similar_internal', label: 'Semantic similar internal', type: 'bool', defaultValue: true },
      { key: 'enable_semantic_keywords', label: 'Semantic keywords', type: 'bool', defaultValue: true },
      { key: 'ml_sentence_model', label: 'Sentence model', type: 'text', defaultValue: 'all-MiniLM-L6-v2' },
      { key: 'ml_max_pages_st', label: 'Max pages (sentence-transformers)', type: 'number', defaultValue: '400' },
      { key: 'ml_similar_top_k', label: 'Similar top K', type: 'number', defaultValue: '5' },
      { key: 'ml_fuzzy_threshold', label: 'Fuzzy threshold', type: 'number', defaultValue: '92' },
      { key: 'ml_simhash_hamming', label: 'Simhash Hamming', type: 'number', defaultValue: '0' },
      { key: 'ml_dup_max_pages', label: 'Dup max pages', type: 'number', defaultValue: '2000' },
      { key: 'ml_ner_max_pages', label: 'NER max pages', type: 'number', defaultValue: '80' },
      { key: 'ml_semantic_keyword_max', label: 'Semantic keyword max', type: 'number', defaultValue: '200' },
      { key: 'ml_keyword_cluster_sim', label: 'Keyword cluster similarity', type: 'number', defaultValue: '75' },
      { key: 'enable_embedding_duplicate_refine', label: 'Embedding duplicate refine', type: 'bool', defaultValue: true },
      { key: 'ml_dup_embed_min_pct', label: 'Dup embed min %', type: 'number', defaultValue: '88' },
      { key: 'enable_keybert', label: 'KeyBERT', type: 'bool', defaultValue: true },
      { key: 'ml_keybert_max_pages', label: 'KeyBERT max pages', type: 'number', defaultValue: '60' },
      { key: 'ml_keybert_top_n', label: 'KeyBERT top N', type: 'number', defaultValue: '8' },
      { key: 'ml_verbose', label: 'ML verbose progress', type: 'bool', defaultValue: true },
    ],
  },
  {
    id: 'pipeline',
    label: 'Pipeline',
    fields: [
      { key: 'run_crawl', label: 'Run crawl', type: 'bool', defaultValue: true },
      { key: 'run_report', label: 'Run report', type: 'bool', defaultValue: true },
      { key: 'run_plot', label: 'Run plot', type: 'bool', defaultValue: true },
    ],
  },
  {
    id: 'google',
    label: 'Google (GSC & GA4)',
    fields: [
      {
        key: 'enable_google_search_console',
        label: 'Enable Search Console fetch',
        type: 'bool',
        defaultValue: false,
        help: 'Configure credentials in Integrations (gear icon).',
      },
      {
        key: 'enable_google_analytics',
        label: 'Enable GA4 fetch',
        type: 'bool',
        defaultValue: false,
      },
      {
        key: 'google_date_range_days',
        label: 'Date range (days)',
        type: 'number',
        defaultValue: '28',
      },
      {
        key: 'google_credentials_path',
        label: 'Credentials file path',
        type: 'text',
        defaultValue: '.secrets/google.json',
        help: 'Set via Integrations UI. Only change if using a custom path.',
      },
      {
        key: 'google_url_gap_list_limit',
        label: 'URL gap list size (per category)',
        type: 'number',
        defaultValue: '200',
        help: 'Cap on rows returned per coverage list (crawl-only, GSC-only, GA4-only).',
      },
      {
        key: 'enrich_keywords_after_report',
        label: 'Enrich keywords after report',
        type: 'tristate',
        defaultValue: 'auto',
        help: 'Auto: follows Enable Search Console. Yes/No: explicit override. When set to Auto the key is omitted from the config file so Python uses its default logic.',
      },
    ],
  },
  {
    id: 'keywords_explorer',
    label: 'Keywords Explorer',
    fields: [
      {
        key: 'enable_google_suggest',
        label: 'Enable Google Suggest expansion',
        type: 'bool',
        defaultValue: false,
        help: 'Expand seed keywords using Google Autocomplete (free, no auth).',
      },
      {
        key: 'enable_google_trends',
        label: 'Enable Google Trends direction (optional, flaky)',
        type: 'bool',
        defaultValue: false,
        help: 'Adds trend direction (up/down/flat) via pytrends. Requires pip install pytrends.',
      },
      {
        key: 'enable_wikipedia_topic',
        label: 'Enable Wikipedia Parent Topic (slow)',
        type: 'bool',
        defaultValue: false,
        help: 'Fetches parent topic from Wikipedia for top keywords. 1s delay per keyword.',
      },
      {
        key: 'enable_datamuse',
        label: 'Enable Datamuse semantic expansion',
        type: 'bool',
        defaultValue: false,
        help: 'Adds semantically related keywords via datamuse.com (free, no auth).',
      },
      {
        key: 'keyword_suggest_top_n',
        label: 'Suggest seeds (top N site keywords)',
        type: 'number',
        defaultValue: '20',
        help: 'Number of top site keywords to use as seeds for Suggest expansion.',
      },
      {
        key: 'keyword_max_suggest_results',
        label: 'Max Suggest results per seed',
        type: 'number',
        defaultValue: '8',
      },
      {
        key: 'keyword_gsc_max_rows',
        label: 'GSC max rows (pagination)',
        type: 'number',
        defaultValue: '25000',
        help: 'Maximum number of keyword rows to fetch from GSC (paginated).',
      },
      {
        key: 'keyword_seeds',
        label: 'Seed keywords (comma-separated)',
        type: 'textarea',
        defaultValue: '',
        help: 'Optional. Always-expand seeds added to every Suggest batch.',
      },
      {
        key: 'brand_name',
        label: 'Brand name',
        type: 'text',
        defaultValue: '',
        help: 'Used to classify branded vs non-branded keywords.',
      },
    ],
  },
  {
    id: 'advanced',
    label: 'Advanced',
    fields: [
      {
        key: 'warning_mapper_input',
        label: 'Warning mapper input file',
        type: 'text',
        defaultValue: '',
        help: 'Path to a Lighthouse/axe/list JSON file for the warnings command.',
      },
      {
        key: 'warning_mapper_input_type',
        label: 'Warning mapper input type',
        type: 'text',
        defaultValue: 'lighthouse',
        help: 'Input type for the warnings command: lighthouse, axe, or list.',
      },
      {
        key: 'warning_mapper_output',
        label: 'Warning mapper output file',
        type: 'text',
        defaultValue: '',
        help: 'Output path for warnings_mapped.json. Leave blank for default next to input file.',
      },
    ],
  },
];

// ─── Derived helpers ──────────────────────────────────────────────────────────

/** Set of all schema-defined keys (for validation / unknown-key detection). */
export const ALL_SCHEMA_KEYS = new Set(
  PIPELINE_CONFIG_SECTIONS.flatMap((s) => s.fields.map((f) => f.key))
);

/**
 * Look up a field descriptor by key.
 * @param {string} key
 * @returns {object | undefined}
 */
export function getFieldByKey(key) {
  for (const section of PIPELINE_CONFIG_SECTIONS) {
    const f = section.fields.find((field) => field.key === key);
    if (f) return f;
  }
  return undefined;
}

/** @returns {Record<string, string | boolean>} */
function isTruthyPipelineBool(value, defaultWhenUnset = false) {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return defaultWhenUnset;
}

/**
 * Validate config before starting a pipeline job.
 * @returns {string[]} error messages (empty if ok)
 */
export function validatePipelineRun({ state, command = null }) {
  const startUrl = String(state?.start_url ?? '').trim();
  const lighthouseUrl = String(state?.lighthouse_url ?? '').trim();
  const errors = [];

  const needsStartUrl =
    command === 'crawl' ||
    command === 'report' ||
    command === 'keywords' ||
    (!command &&
      (isTruthyPipelineBool(state?.run_crawl, true) || isTruthyPipelineBool(state?.run_report, true)));

  const needsLighthouseUrl =
    command === 'lighthouse' ||
    (!command && isTruthyPipelineBool(state?.run_lighthouse, false) && !isTruthyPipelineBool(state?.run_lighthouse_on_pages, false));

  if (needsStartUrl && !startUrl) {
    errors.push('Start URL is required. Enter the site URL in Pipeline settings before running.');
  }
  if (needsLighthouseUrl && !lighthouseUrl && !startUrl) {
    errors.push('Lighthouse URL or Start URL is required for single-URL Lighthouse.');
  }
  return errors;
}

export function buildInitialPipelineConfigState() {
  const out = {};
  for (const section of PIPELINE_CONFIG_SECTIONS) {
    for (const f of section.fields) {
      if (f.type === 'bool') {
        out[f.key] = f.defaultValue;
      } else if (f.type === 'tristate') {
        out[f.key] = f.defaultValue ?? 'auto';
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
export function serializePipelineConfig(state) {
  const lines = [
    '# WebsiteProfiling config (managed by web UI)',
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
