# Site Audit MCP server

Read-only [Model Context Protocol](https://modelcontextprotocol.io) tools for querying audit data from Cursor, Claude Desktop, or other MCP clients.

## Install

```bash
pip install -r requirements-mcp.txt
export DATABASE_URL=postgres://profiling:profiling@localhost:5432/website_profiling
export PYTHONPATH=src
```

## Cursor configuration

Add to `.cursor/mcp.json` (or Cursor MCP settings):

```json
{
  "mcpServers": {
    "site-audit": {
      "command": "python",
      "args": ["-m", "website_profiling.mcp"],
      "env": {
        "DATABASE_URL": "postgres://profiling:profiling@localhost:5432/website_profiling",
        "PYTHONPATH": "src",
        "WP_PROPERTY_ID": "1"
      }
    }
  }
}
```

`WP_PROPERTY_ID` sets the default property when tools omit `property_id`.

## MCP resources

| URI | Content |
|-----|---------|
| `audit://properties` | JSON list of properties |
| `audit://property/{id}` | Property details + latest report summary |
| `audit://property/{id}/report/latest` | Payload key index (counts, not full blob) |
| `audit://property/{id}/report/{report_id}` | Payload key index for a specific report |
| `audit://glossary` | Excerpt from `docs/GLOSSARY.md` |
| `audit://tools` | Tool catalog grouped by SEO domain |

## Tools (171 read-only + export)

### Export and deliverables

`export_audit_report`, `export_compare_csv`, `export_list_as_csv`, `compose_custom_report`, `export_custom_report`, `list_export_formats`

Full audit exports reuse the same generators as the Export view (PDF requires `reportlab`). Export tools store files as artifacts (24h TTL); in-app chat renders download buttons via `/api/chat/artifacts/{id}`.

### Image audit

`get_image_audit_summary`, `list_pages_without_lazy_images`, `list_pages_with_images_missing_dimensions`, `list_site_image_urls`, `list_lighthouse_image_opportunities`, `list_largest_images`, `list_unoptimized_images`, `list_images_needing_attention`

Size-based tools require `probe_image_inventory=true` in pipeline config when building the report. Keys: `max_image_probe_urls` (default 500), `image_probe_concurrency`, `image_probe_timeout`, `image_unoptimized_min_kb` (default 200).

### Portfolio and report

`list_properties`, `get_property`, `get_report_summary`, `get_category_scores`, `get_executive_summary`, `get_report_meta`, `get_site_level`, `list_report_history`, `get_audit_recommendations`, `get_ml_errors`, `get_ssl_expiry_info`, `list_audit_categories`, `get_category_recommendations`, `get_crawl_summary`, `get_portfolio_summary`

### Issues and workflow

`list_issues`, `search_issues`, `list_issues_by_category`, `get_category_issues`, `list_issue_workflow`, `list_issues_with_ai_fixes`, `list_seo_onpage_issues`

### On-page SEO

`list_content_url_issues`, `list_pages_missing_title`, `list_pages_missing_h1`, `list_pages_multiple_h1`, `list_pages_missing_meta_description`, `list_pages_meta_desc_too_short`, `list_pages_meta_desc_too_long`, `list_pages_noindex`, `get_seo_health`, `list_pages_missing_canonical`, `list_canonical_mismatch`, `list_pages_with_missing_alt`, `list_pages_skipped_headings`, `list_pages_missing_viewport`, `list_pages_missing_og_image`

### Crawl and pages

`search_pages`, `search_pages_advanced`, `get_page_details`, `get_page_analysis`, `get_internal_links`, `list_redirects`, `list_broken_links`, `list_status_4xx_pages`, `list_status_5xx_pages`, `get_status_code_breakdown`, `get_response_time_stats`, `get_depth_distribution`, `get_crawl_segments`, `get_browser_diagnostics_summary`, `list_pages_with_console_errors`, `list_pages_by_fetch_method`, `get_crawl_links_table`, `get_graph_edges_sample`, `list_long_redirect_chains`, `list_robots_blocked_urls`, `get_top_pages_by_pagerank`

### Schema and technical

`get_schema_coverage`, `list_pages_without_schema`, `search_pages_by_schema_type`, `get_tech_stack_summary`, `list_pages_by_technology`, `get_security_findings`, `get_security_findings_summary`, `list_security_findings_by_type`

### Links and architecture

`list_orphan_pages`, `get_top_linked_pages`, `get_top_crawled_pages`, `get_outbound_link_domains`, `get_link_graph_summary`, `get_url_fingerprints`, `list_broken_link_sources`, `get_mime_type_breakdown`, `get_title_length_distribution`, `get_domain_link_distribution`, `get_outlink_distribution`

### Indexation and international

`get_indexation_coverage`, `list_indexation_gaps`, `get_indexation_url_join`, `get_hreflang_summary`, `get_language_summary`

### Content and social

`get_content_analytics`, `get_content_duplicates`, `get_duplicate_cluster`, `get_social_coverage`, `get_keyword_opportunities`, `get_ner_site_summary`, `list_thin_content_pages`

### Keywords

`get_keyword_summary`, `search_keywords`, `get_striking_distance_keywords`, `get_keyword_cannibalisation`, `get_query_page_misalignment`, `get_semantic_keyword_clusters`, `get_keyword_history`, `get_keyword_serp_overlay`, `list_keywords_by_action`, `list_keywords_by_position`, `list_keywords_by_impressions`, `expand_keywords`, `generate_content_brief`

### Google

`get_google_summary`, `get_google_integration_status`, `get_gsc_top_queries`, `get_gsc_top_pages`, `get_ga4_summary`, `get_ga4_page_metrics`, `get_gsc_page_query_slice`

### Backlinks

`get_gsc_links_summary`, `get_gsc_links_import_status`, `get_gsc_sample_links`, `get_gsc_latest_links`, `get_third_party_links_overlay`, `get_backlinks_velocity`, `get_competitor_link_gap`, `get_bing_backlinks_summary`

### Performance

`get_lighthouse_summary`, `get_lighthouse_for_url`, `get_lighthouse_human_summary`, `get_lighthouse_diagnostics`, `get_crux_summary`, `list_slow_pages`, `list_lighthouse_poor_seo_pages`, `list_lighthouse_poor_accessibility_pages`, `list_lighthouse_poor_best_practices_pages`, `list_lighthouse_cwv_failures`

### Drift, health, and compare

`get_health_history`, `get_category_health_history`, `compare_reports`, `compare_issue_deltas`, `compare_category_deltas`, `compare_seo_health_deltas`, `compare_lighthouse_deltas`, `compare_url_set_diff`, `compare_redirect_deltas`, `compare_link_metric_deltas`, `compare_security_deltas`, `compare_duplicate_deltas`, `compare_tech_deltas`, `compare_content_metrics`, `compare_google_metrics`, `compare_priority_counts`, `compare_health_score_delta`

### Ops and logs

`get_integration_alerts`, `get_property_ops`, `list_crawl_runs`, `list_log_uploads`, `get_latest_log_analysis`, `get_log_top_paths`, `list_log_only_paths`, `list_crawl_only_paths`, `get_log_googlebot_stats`, `get_log_analysis_by_id`, `get_page_coach`

## Future pipeline items (not yet exposed as tools)

These require additional crawl or third-party integrations before dedicated tools are useful:

- Google Rich Results / schema validation API
- Full backlink index and anchor-text analytics
- axe / color-contrast accessibility audits
- SERP rank tracking beyond GSC position snapshots

## Example prompts

- "What indexation gaps exist between crawl and GSC?"
- "List pages missing canonical tags or with canonical mismatches"
- "Which paths appear in access logs but were not crawled?"
- "Compare GSC clicks vs the previous audit"
- "List pages failing Core Web Vitals thresholds"
- "Show security finding changes since report 38"
- "Which pages link to broken URLs?"
- "Generate a content brief for keyword X"
- "Download the audit as PDF"
- "Export broken links as CSV"
- "Compare report 38 to the current audit and give me a CSV diff"
- "Build a client report with executive summary, category scores, and top critical issues as PDF"
- "Which images are largest and unoptimized?"
- "List pages with images missing alt or lazy loading"

## In-app chat

The same tools power **AI Chat** at [http://localhost:3000/chat](http://localhost:3000/chat). Enable AI in Run audit → AI settings.

## Ollama note

When the local Ollama daemon supports native tools (most current models, including Ollama cloud refs like `minimax-m3:cloud`), chat uses Ollama’s `/api/chat` tool format. Older or tool-less models fall back to JSON ReAct parsing. OpenAI and Anthropic always use native tool calling with streaming in the chat UI.
