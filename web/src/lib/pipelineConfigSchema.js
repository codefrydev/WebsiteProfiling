/**
 * Mirrors repo `input.txt` keys for the pipeline runner UI.
 * Serialized as `key = value` lines for `python -m src --config`.
 */

export const PIPELINE_CONFIG_SECTIONS = [
  {
    id: 'crawl',
    label: 'Crawl',
    fields: [
      { key: 'start_url', label: 'Start URL', type: 'text', defaultValue: 'https://codefrydev.in' },
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
      },
      { key: 'crawl_output', label: 'Crawl output (JSON/CSV)', type: 'text', defaultValue: 'crawl_results.json' },
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
      { key: 'site_name', label: 'Site name', type: 'text', defaultValue: 'codefrydev.in' },
      { key: 'report_title', label: 'Report title', type: 'text', defaultValue: 'codefrydev.in Report' },
      { key: 'max_fetch_for_edges', label: 'Max fetch for edges', type: 'number', defaultValue: '300' },
      { key: 'same_domain_only', label: 'Same domain only', type: 'bool', defaultValue: true },
      { key: 'max_nodes_plot', label: 'Max nodes (plot)', type: 'number', defaultValue: '400' },
      { key: 'run_security_scan', label: 'Run security scan', type: 'bool', defaultValue: true },
      { key: 'security_scan_active', label: 'Security scan active (probes)', type: 'bool', defaultValue: false },
      { key: 'security_max_urls_probe', label: 'Security max URLs to probe', type: 'number', defaultValue: '20' },
    ],
  },
  {
    id: 'lighthouse',
    label: 'Lighthouse',
    fields: [
      { key: 'lighthouse_url', label: 'Lighthouse URL', type: 'text', defaultValue: 'https://codefrydev.in' },
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
    id: 'keywords',
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
];

/** @returns {Record<string, string | boolean>} */
export function buildInitialPipelineConfigState() {
  /** @type {Record<string, string | boolean>} */
  const out = {};
  for (const section of PIPELINE_CONFIG_SECTIONS) {
    for (const f of section.fields) {
      out[f.key] = f.type === 'bool' ? f.defaultValue : String(f.defaultValue);
    }
  }
  return out;
}

/**
 * @param {Record<string, string | boolean>} state
 * @returns {string}
 */
export function serializePipelineConfig(state) {
  const lines = ['# WebsiteProfiling config (generated by web UI)', '# key = value; comments start with #.', ''];
  for (const section of PIPELINE_CONFIG_SECTIONS) {
    lines.push(`# --- ${section.label} ---`);
    for (const f of section.fields) {
      const v = state[f.key];
      if (f.type === 'bool') {
        lines.push(`${f.key} = ${v === true ? 'true' : 'false'}`);
      } else {
        const s = v == null ? '' : String(v).trim();
        lines.push(`${f.key} = ${s}`);
      }
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}
