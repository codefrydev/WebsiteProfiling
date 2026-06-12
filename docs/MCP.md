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

## Tools (221 read-only + export)

### Export and deliverables

`export_audit_report`, `export_compare_csv`, `export_list_as_csv`, `export_sitemap_xml`, `validate_rich_results`, `compose_custom_report`, `export_custom_report`, `list_export_formats`

Full audit exports reuse the same generators as the Export view (PDF requires `reportlab`). Export tools store files as artifacts (24h TTL); in-app chat renders download buttons via `/api/chat/artifacts/{id}`.

### Image audit

`get_image_audit_summary`, `list_pages_without_lazy_images`, `list_pages_with_images_missing_dimensions`, `list_site_image_urls`, `list_lighthouse_image_opportunities`, `list_largest_images`, `list_unoptimized_images`, `list_images_needing_attention`

Size-based tools require `probe_image_inventory=true` in pipeline config when building the report. Keys: `max_image_probe_urls` (default 500), `image_probe_concurrency`, `image_probe_timeout`, `image_unoptimized_min_kb` (default 200).

### Portfolio and report

`list_properties`, `get_property`, `get_report_summary`, `get_category_scores`, `get_executive_summary`, `get_report_meta`, `get_site_level`, `list_report_history`, `get_audit_recommendations`, `get_ml_errors`, `get_ssl_expiry_info`, `list_audit_categories`, `get_category_recommendations`, `get_crawl_summary`, `get_portfolio_summary`

### Issues and workflow

`list_issues`, `search_issues`, `list_top_impact_issues`, `prioritize_fix_roadmap`, `list_issues_by_category`, `get_category_issues`, `list_issue_workflow`, `list_issues_with_ai_fixes`, `generate_issue_fix`, `summarize_category_for_client`, `list_seo_onpage_issues`

### On-page SEO

`list_content_url_issues`, `list_pages_missing_title`, `list_pages_missing_h1`, `list_pages_multiple_h1`, `list_pages_missing_meta_description`, `list_pages_meta_desc_too_short`, `list_pages_meta_desc_too_long`, `list_pages_noindex`, `get_seo_health`, `list_pages_missing_canonical`, `list_canonical_mismatch`, `list_pages_with_missing_alt`, `list_pages_skipped_headings`, `list_pages_missing_viewport`, `list_pages_missing_og_image`

### Crawl and pages

`search_pages`, `search_pages_advanced`, `get_page_details`, `get_page_analysis`, `get_internal_links`, `list_redirects`, `list_broken_links`, `list_status_4xx_pages`, `list_status_5xx_pages`, `list_pages_soft_404`, `list_dead_end_pages`, `list_duplicate_title_groups`, `list_heavy_pages_by_bytes`, `list_pages_poor_cache_headers`, `list_pages_low_content_ratio`, `get_heading_outline_for_url`, `get_status_code_breakdown`, `get_response_time_stats`, `get_depth_distribution`, `get_crawl_segments`, `get_browser_diagnostics_summary`, `list_pages_with_console_errors`, `list_pages_by_fetch_method`, `get_crawl_links_table`, `get_graph_edges_sample`, `list_long_redirect_chains`, `list_robots_blocked_urls`, `get_top_pages_by_pagerank`, `get_pagination_audit_summary`, `get_js_rendering_delta`

### Accessibility and assets

`list_pages_with_axe_violations`, `get_axe_audit_summary`, `list_pages_with_mixed_content`, `get_asset_weight_summary`, `get_readability_summary`

### Rich results and portfolio extras

`get_rich_results_summary`, `list_rich_results_failures`, `get_competitor_keyword_gap`, `get_portfolio_benchmark`, `get_site_anchor_text_summary`

### Schema and technical

`get_schema_coverage`, `list_pages_without_schema`, `search_pages_by_schema_type`, `get_tech_stack_summary`, `list_pages_by_technology`, `get_security_findings`, `get_security_findings_summary`, `list_security_findings_by_type`

### Links and architecture

`get_link_rel_summary`, `get_inlink_anchors`, `list_nofollow_internal_links`, `list_orphan_pages`, `get_top_linked_pages`, `get_top_crawled_pages`, `get_outbound_link_domains`, `get_link_graph_summary`, `get_url_fingerprints`, `list_broken_link_sources`, `get_mime_type_breakdown`, `get_title_length_distribution`, `get_domain_link_distribution`, `get_outlink_distribution`

### Indexation and international

`get_indexation_coverage`, `list_indexation_gaps`, `get_indexation_url_join`, `get_hreflang_summary`, `get_language_summary`

### Content and social

`get_content_analytics`, `get_content_duplicates`, `get_duplicate_cluster`, `get_social_coverage`, `get_keyword_opportunities`, `get_ner_site_summary`, `list_thin_content_pages`

### Keywords

`get_keyword_summary`, `search_keywords`, `get_striking_distance_keywords`, `get_keyword_cannibalisation`, `get_query_page_misalignment`, `get_semantic_keyword_clusters`, `get_keyword_history`, `get_keyword_serp_overlay`, `get_serp_feature_overlay`, `list_keywords_by_action`, `list_keywords_by_position`, `list_keywords_by_impressions`, `list_keywords_ctr_opportunity`, `expand_keywords`, `generate_content_brief`

### Google and CTR

`get_google_summary`, `get_google_integration_status`, `get_gsc_top_queries`, `get_gsc_top_pages`, `get_gsc_ctr_opportunity_pages`, `get_ga4_summary`, `get_ga4_page_metrics`, `get_gsc_page_query_slice`, `get_gsc_url_inspection`, `get_gsc_index_coverage`, `analyze_serp_snippet_for_url`

### Backlinks

`get_gsc_links_summary`, `get_gsc_links_import_status`, `get_gsc_sample_links`, `get_gsc_latest_links`, `get_third_party_links_overlay`, `get_backlinks_velocity`, `get_competitor_link_gap`, `get_bing_backlinks_summary`

### Performance

`get_lighthouse_summary`, `get_lighthouse_for_url`, `get_lighthouse_human_summary`, `get_lighthouse_diagnostics`, `get_crux_summary`, `list_slow_pages`, `list_lighthouse_poor_seo_pages`, `list_lighthouse_poor_accessibility_pages`, `list_lighthouse_poor_best_practices_pages`, `list_lighthouse_cwv_failures`

### Drift, health, and compare

`get_health_history`, `get_category_health_history`, `compare_reports`, `compare_issue_deltas`, `compare_category_deltas`, `compare_seo_health_deltas`, `compare_lighthouse_deltas`, `compare_url_set_diff`, `compare_redirect_deltas`, `compare_link_metric_deltas`, `compare_security_deltas`, `compare_duplicate_deltas`, `compare_tech_deltas`, `compare_content_metrics`, `compare_google_metrics`, `compare_priority_counts`, `compare_health_score_delta`, `compare_indexation_deltas`, `compare_orphan_deltas`

### GEO / AEO

`get_geo_readiness_score`, `get_aeo_content_signals_for_url`, `get_llms_txt_status`, `draft_llms_txt`, `get_faq_schema_coverage`, `list_pages_missing_faq_schema`, `get_eeat_signals_summary`, `get_internal_link_suggestions`, `check_ai_citation_presence`

### Integrations

`get_bing_index_status` (requires `bing_webmaster_api_key` in audit settings)

### Ops and logs

`get_integration_alerts`, `get_property_ops`, `list_crawl_runs`, `list_log_uploads`, `get_latest_log_analysis`, `get_log_top_paths`, `list_log_only_paths`, `list_crawl_only_paths`, `get_log_googlebot_stats`, `get_log_analysis_by_id`, `get_page_coach`

## Future pipeline items

- Full backlink index and anchor-text analytics (beyond GSC Links import)
- SERP rank tracking beyond GSC position snapshots
- Live AI citation checks across ChatGPT/Perplexity (current `check_ai_citation_presence` uses on-site heuristics)

Already available: `validate_rich_results`, `get_gsc_url_inspection`, `export_sitemap_xml`, workbook export, axe audits via `enable_axe` on browser crawls.

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
- "What should we fix first on high-traffic pages?" (use `list_top_impact_issues` or `prioritize_fix_roadmap`)
- "What's our GEO readiness score?"
- "Inspect GSC indexing for https://example.com/page"
- "Which pages are soft 404s or dead ends?"
- "Suggest internal links for our top blog post"
- "List pages with images missing alt or lazy loading"

## In-app chat

The same tools power **AI Chat** at [http://localhost:3000/chat](http://localhost:3000/chat). Enable AI in Run audit → AI settings.

## Ollama note

When the local Ollama daemon supports native tools (most current models, including Ollama cloud refs like `minimax-m3:cloud`), chat uses Ollama’s `/api/chat` tool format. Older or tool-less models fall back to JSON ReAct parsing. OpenAI and Anthropic always use native tool calling with streaming in the chat UI.
