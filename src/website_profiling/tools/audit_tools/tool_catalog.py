"""TOOL_DEFINITIONS catalog for MCP and chat agent."""
from __future__ import annotations

from typing import Any

_PID = {"type": "integer", "description": "Property ID"}
_RID = {"type": "integer", "description": "Report ID (defaults to latest)"}
_LIMIT = {"type": "integer", "minimum": 1, "maximum": 50}
_URL = {"type": "string", "description": "Page URL"}


def _tool(name: str, description: str, properties: dict[str, Any], required: list[str] | None = None) -> dict[str, Any]:
    return {
        "name": name,
        "description": description,
        "inputSchema": {
            "type": "object",
            "properties": properties,
            "required": required or [],
        },
    }


TOOL_DEFINITIONS: list[dict[str, Any]] = [
    _tool("list_properties", "List all configured site properties (domains) in Site Audit.", {}),
    _tool("get_property", "Get details for one property by property_id.", {"property_id": _PID}, ["property_id"]),
    _tool(
        "get_report_summary",
        "Health score, issue counts by priority, crawl stats, and category scores for the latest or specified report.",
        {"property_id": _PID, "report_id": _RID},
    ),
    _tool("get_category_scores", "Category scores and overall health score for a report.", {"property_id": _PID, "report_id": _RID}),
    _tool("get_executive_summary", "AI-generated executive summary narrative for the audit report.", {"property_id": _PID, "report_id": _RID}),
    _tool("get_report_meta", "Report metadata: crawl scope, fetch methods, integration freshness.", {"property_id": _PID, "report_id": _RID}),
    _tool("get_site_level", "Site-level robots.txt and sitemap.xml checks.", {"property_id": _PID, "report_id": _RID}),
    _tool("list_report_history", "Past audit reports for a property (report IDs and dates).", {"property_id": _PID, "limit": _LIMIT}),
    _tool(
        "list_issues",
        "List audit issues with optional filters. Returns paginated results (max 50).",
        {
            "property_id": _PID,
            "report_id": _RID,
            "priority": {"type": "string", "enum": ["Critical", "High", "Medium", "Low"]},
            "category_id": {"type": "string"},
            "url_contains": {"type": "string"},
            "limit": _LIMIT,
        },
    ),
    _tool("list_issues_by_category", "List issues for one category_id only.", {"category_id": {"type": "string"}, "property_id": _PID, "report_id": _RID, "limit": _LIMIT}, ["category_id"]),
    _tool("get_category_issues", "Full issue list and score for a single audit category.", {"category_id": {"type": "string"}, "property_id": _PID, "report_id": _RID}, ["category_id"]),
    _tool("list_issue_workflow", "Issue triage workflow status from issue_status table.", {"property_id": _PID, "status": {"type": "string"}, "limit": _LIMIT}),
    _tool("search_pages", "Search crawled pages by status code or URL substring. Max 30 results.", {"property_id": _PID, "report_id": _RID, "status": {"type": "string"}, "url_contains": {"type": "string"}, "limit": {"type": "integer", "maximum": 30}}),
    _tool("get_page_details", "Crawl row, Lighthouse snippet, and GSC/GA4 slice for one URL.", {"url": _URL, "property_id": _PID, "report_id": _RID}, ["url"]),
    _tool("get_internal_links", "Inlinks and outlinks for one URL from crawl graph.", {"url": _URL, "property_id": _PID, "report_id": _RID}, ["url"]),
    _tool("list_redirects", "Redirect chains detected in crawl (3xx with final URL).", {"property_id": _PID, "report_id": _RID, "limit": _LIMIT}),
    _tool("list_broken_links", "Broken internal links (4xx/5xx) from crawl issues.", {"property_id": _PID, "report_id": _RID, "limit": _LIMIT}),
    _tool("get_status_code_breakdown", "HTTP status code counts from crawl summary.", {"property_id": _PID, "report_id": _RID}),
    _tool("get_response_time_stats", "Response time percentiles (p50, p95) from crawl.", {"property_id": _PID, "report_id": _RID}),
    _tool("get_depth_distribution", "Crawl depth histogram (clicks from start URL).", {"property_id": _PID, "report_id": _RID}),
    _tool("get_crawl_segments", "Per-path-prefix crawl segment rollups (requires crawl_path_segments config).", {"property_id": _PID, "report_id": _RID}),
    _tool("get_browser_diagnostics_summary", "Aggregated JS console errors and browser diagnostics from rendered crawl.", {"property_id": _PID, "report_id": _RID}),
    _tool("get_schema_coverage", "Site-wide schema.org coverage from crawl (has_schema + JSON-LD types).", {"property_id": _PID, "report_id": _RID}),
    _tool("list_pages_without_schema", "URLs missing structured data markup. Empty list means full coverage.", {"property_id": _PID, "report_id": _RID, "limit": {"type": "integer", "maximum": 30}}),
    _tool("search_pages_by_schema_type", "Find pages with a specific JSON-LD type (e.g. Organization, Article).", {"schema_type": {"type": "string"}, "property_id": _PID, "report_id": _RID, "limit": {"type": "integer", "maximum": 30}}, ["schema_type"]),
    _tool("get_seo_health", "On-page SEO KPI counts: titles, meta descriptions, H1s, thin content.", {"property_id": _PID, "report_id": _RID}),
    _tool("list_orphan_pages", "Crawled URLs with zero internal inlinks.", {"property_id": _PID, "report_id": _RID, "limit": _LIMIT}),
    _tool("get_top_linked_pages", "Most-linked internal pages by inlink count.", {"property_id": _PID, "report_id": _RID, "limit": _LIMIT}),
    _tool("get_outbound_link_domains", "External domains linked from the site.", {"property_id": _PID, "report_id": _RID, "limit": _LIMIT}),
    _tool("get_link_graph_summary", "Internal link graph node/edge counts and top hub pages.", {"property_id": _PID, "report_id": _RID}),
    _tool("get_url_fingerprints", "URL pattern fingerprints for duplicate URL detection.", {"property_id": _PID, "report_id": _RID, "limit": _LIMIT}),
    _tool("get_indexation_coverage", "Sitemap vs crawl vs GSC URL set comparison and gap lists.", {"property_id": _PID, "report_id": _RID}),
    _tool("get_hreflang_summary", "Hreflang alternate tag coverage and issues.", {"property_id": _PID, "report_id": _RID}),
    _tool("get_language_summary", "Detected page language distribution.", {"property_id": _PID, "report_id": _RID}),
    _tool("get_content_analytics", "Word count stats, thin pages, top site keywords from crawl.", {"property_id": _PID, "report_id": _RID}),
    _tool("get_content_duplicates", "Near-duplicate content clusters from ML analysis.", {"property_id": _PID, "report_id": _RID, "limit": _LIMIT}),
    _tool("get_social_coverage", "Open Graph and Twitter card coverage percentages.", {"property_id": _PID, "report_id": _RID}),
    _tool("get_keyword_opportunities", "On-page keyword opportunity hints from crawl.", {"property_id": _PID, "report_id": _RID}),
    _tool("get_ner_site_summary", "Named-entity summary across site content.", {"property_id": _PID, "report_id": _RID}),
    _tool("list_thin_content_pages", "Pages flagged as thin content (low word count).", {"property_id": _PID, "report_id": _RID, "limit": _LIMIT}),
    _tool("get_keyword_summary", "Top keywords, striking-distance count, and GSC metrics.", {"property_id": _PID, "limit": _LIMIT}, ["property_id"]),
    _tool("search_keywords", "Search keyword list by substring match.", {"property_id": _PID, "query": {"type": "string"}, "limit": _LIMIT}, ["property_id", "query"]),
    _tool("get_striking_distance_keywords", "Keywords ranking positions 4–20 (striking distance opportunities).", {"property_id": _PID, "limit": _LIMIT}, ["property_id"]),
    _tool("get_keyword_cannibalisation", "Queries where multiple pages rank in GSC.", {"property_id": _PID, "limit": _LIMIT}, ["property_id"]),
    _tool("get_query_page_misalignment", "GSC queries whose landing page may not match intent.", {"property_id": _PID, "limit": _LIMIT}, ["property_id"]),
    _tool("get_semantic_keyword_clusters", "LLM-generated semantic keyword clusters.", {"property_id": _PID, "report_id": _RID, "limit": _LIMIT}),
    _tool("get_keyword_history", "Time-series GSC metrics for one keyword.", {"property_id": _PID, "keyword": {"type": "string"}, "limit": _LIMIT}, ["property_id", "keyword"]),
    _tool("get_google_summary", "GSC and GA4 headline metrics, top queries and pages.", {"property_id": _PID}),
    _tool("get_gsc_top_queries", "Top Search Console queries by clicks.", {"property_id": _PID, "limit": _LIMIT}),
    _tool("get_gsc_top_pages", "Top Search Console pages by clicks.", {"property_id": _PID, "limit": _LIMIT}),
    _tool("get_ga4_summary", "GA4 organic summary and top landing pages.", {"property_id": _PID, "limit": _LIMIT}),
    _tool("get_gsc_page_query_slice", "GSC queries and metrics for a single page URL.", {"url": _URL, "property_id": _PID}, ["url"]),
    _tool("get_gsc_links_summary", "GSC Links CSV import summary: top linking sites and linked pages.", {"property_id": _PID, "limit": _LIMIT}, ["property_id"]),
    _tool("get_gsc_links_import_status", "Whether GSC Links data is imported and when.", {"property_id": _PID}, ["property_id"]),
    _tool("get_competitor_link_gap", "Domains linking to competitors but not you (requires competitor_domains config).", {"property_id": _PID, "report_id": _RID}),
    _tool("get_bing_backlinks_summary", "Bing Webmaster backlinks summary (if API key configured).", {"property_id": _PID, "report_id": _RID}),
    _tool("get_lighthouse_summary", "Site-wide Lighthouse summary and poor-performance pages.", {"property_id": _PID, "report_id": _RID}),
    _tool("get_lighthouse_for_url", "Lighthouse scores and audits for one URL.", {"url": _URL, "property_id": _PID, "report_id": _RID}, ["url"]),
    _tool("get_lighthouse_diagnostics", "Lighthouse audit diagnostics across sampled pages.", {"property_id": _PID, "report_id": _RID, "limit": _LIMIT}),
    _tool("get_crux_summary", "Chrome UX Report field data (CrUX) for origin.", {"property_id": _PID, "report_id": _RID}),
    _tool("list_slow_pages", "Pages with Lighthouse performance below threshold (default 50).", {"property_id": _PID, "report_id": _RID, "performance_threshold": {"type": "integer"}, "limit": _LIMIT}),
    _tool("get_health_history", "Historical health score snapshots for trend analysis.", {"property_id": _PID, "limit": _LIMIT}, ["property_id"]),
    _tool("compare_reports", "Full audit drift comparison between current and baseline report.", {"baseline_report_id": _RID, "report_id": _RID}, ["baseline_report_id"]),
    _tool("get_integration_alerts", "Stale GSC Links imports and health score drop alerts.", {"property_id": _PID}, ["property_id"]),
    _tool("get_tech_stack_summary", "Detected technologies (CMS, analytics, CDN) from crawl.", {"property_id": _PID, "report_id": _RID}),
    _tool("get_security_findings", "Security header and TLS findings from security scan.", {"property_id": _PID, "report_id": _RID, "severity": {"type": "string"}, "limit": _LIMIT}),
    # Report extras
    _tool("get_audit_recommendations", "Actionable SEO recommendation bullets from the audit.", {"property_id": _PID, "report_id": _RID}),
    _tool("get_ml_errors", "ML analysis errors (duplicates, NER, clusters) if any failed.", {"property_id": _PID, "report_id": _RID}),
    _tool("get_ssl_expiry_info", "Site TLS certificate expiry from the audit.", {"property_id": _PID, "report_id": _RID}),
    _tool("list_audit_categories", "All audit categories with scores and issue counts.", {"property_id": _PID, "report_id": _RID}),
    _tool("get_category_recommendations", "Category-level recommendations for one category_id.", {"category_id": {"type": "string"}, "property_id": _PID, "report_id": _RID}, ["category_id"]),
    _tool("list_issues_with_ai_fixes", "Issues that include LLM-generated fix suggestions.", {"property_id": _PID, "report_id": _RID, "limit": _LIMIT}),
    # On-page
    _tool("list_seo_onpage_issues", "Flat SEO issue list (titles, meta, H1, thin content) with optional issue_type filter.", {"property_id": _PID, "report_id": _RID, "issue_type": {"type": "string"}, "limit": _LIMIT}),
    _tool("list_content_url_issues", "Pages in a content_urls bucket (missing_title, missing_h1, thin_content, etc.).", {"bucket": {"type": "string"}, "property_id": _PID, "report_id": _RID, "limit": _LIMIT}, ["bucket"]),
    _tool("list_pages_missing_title", "Pages with no title tag.", {"property_id": _PID, "report_id": _RID, "limit": _LIMIT}),
    _tool("list_pages_missing_h1", "Pages with no H1.", {"property_id": _PID, "report_id": _RID, "limit": _LIMIT}),
    _tool("list_pages_multiple_h1", "Pages with multiple H1 elements.", {"property_id": _PID, "report_id": _RID, "limit": _LIMIT}),
    _tool("list_pages_missing_meta_description", "Pages with no meta description.", {"property_id": _PID, "report_id": _RID, "limit": _LIMIT}),
    _tool("list_pages_meta_desc_too_short", "Pages with meta description under 70 characters.", {"property_id": _PID, "report_id": _RID, "limit": _LIMIT}),
    _tool("list_pages_meta_desc_too_long", "Pages with meta description over 160 characters.", {"property_id": _PID, "report_id": _RID, "limit": _LIMIT}),
    _tool("list_pages_noindex", "Crawled pages with noindex directive.", {"property_id": _PID, "report_id": _RID, "limit": _LIMIT}),
    # Charts / aggregates
    _tool("get_crawl_summary", "Full crawl summary block (URL counts, success rate, timing).", {"property_id": _PID, "report_id": _RID}),
    _tool(
        "get_issue_priority_breakdown",
        "Issue counts by priority (Critical/High/Medium/Low) as chart data for chat UI.",
        {"property_id": _PID, "report_id": _RID},
    ),
    _tool(
        "get_critical_issues",
        "All Critical-priority audit issues with URL, category, and message (for chat issue table).",
        {"property_id": _PID, "report_id": _RID, "limit": _LIMIT},
    ),
    _tool("get_mime_type_breakdown", "Content-Type distribution from crawl.", {"property_id": _PID, "report_id": _RID}),
    _tool("get_title_length_distribution", "Title length histogram from crawl.", {"property_id": _PID, "report_id": _RID}),
    _tool("get_domain_link_distribution", "Internal link domain breakdown chart data.", {"property_id": _PID, "report_id": _RID}),
    _tool("get_outlink_distribution", "Outlink count distribution chart data.", {"property_id": _PID, "report_id": _RID}),
    _tool("get_top_crawled_pages", "Top pages by inlinks from crawl.", {"property_id": _PID, "report_id": _RID, "limit": _LIMIT}),
    # Indexation depth
    _tool("list_indexation_gaps", "URLs in an indexation gap list (sitemap_only, crawled_not_in_sitemap, gsc_not_crawled).", {"gap_type": {"type": "string"}, "property_id": _PID, "report_id": _RID, "limit": {"type": "integer", "maximum": 200}}, ["gap_type"]),
    _tool("get_indexation_url_join", "GSC vs crawl URL join table from indexation coverage.", {"property_id": _PID, "report_id": _RID}),
    # Backlinks depth
    _tool("get_gsc_sample_links", "Sample backlinks from GSC Links CSV import.", {"property_id": _PID, "limit": {"type": "integer", "maximum": 100}}, ["property_id"]),
    _tool("get_gsc_latest_links", "Latest discovered backlinks from GSC Links import.", {"property_id": _PID, "limit": {"type": "integer", "maximum": 100}}, ["property_id"]),
    _tool("get_third_party_links_overlay", "Moz/Majestic third-party backlink overlays.", {"property_id": _PID, "provider": {"type": "string"}}, ["property_id"]),
    _tool("get_backlinks_velocity", "Referring-domain trend from gsc_links_snapshots.", {"property_id": _PID, "limit": _LIMIT}, ["property_id"]),
    # Ops / integrations
    _tool("get_property_ops", "Schedule cron and alert webhook/email settings (read-only).", {"property_id": _PID}, ["property_id"]),
    _tool("get_google_integration_status", "Google OAuth, GSC/GA4 mapping, and data freshness.", {"property_id": _PID}, ["property_id"]),
    _tool("list_crawl_runs", "Recent crawl run history for a property.", {"property_id": _PID, "limit": _LIMIT}),
    _tool("list_log_uploads", "Access log file uploads for a property.", {"property_id": _PID, "limit": _LIMIT}, ["property_id"]),
    _tool("get_latest_log_analysis", "Most recent parsed access log analysis.", {"property_id": _PID}, ["property_id"]),
    # Keywords depth
    _tool("get_keyword_serp_overlay", "Keywords with SERP competition overlay data.", {"property_id": _PID, "limit": _LIMIT}, ["property_id"]),
    _tool("list_keywords_by_action", "Keywords filtered by recommended_action.", {"property_id": _PID, "recommended_action": {"type": "string"}, "limit": _LIMIT}, ["property_id", "recommended_action"]),
    _tool("list_keywords_by_position", "Keywords filtered by GSC position range.", {"property_id": _PID, "min_position": {"type": "number"}, "max_position": {"type": "number"}, "limit": _LIMIT}, ["property_id"]),
    _tool("list_keywords_by_impressions", "Keywords with at least min_impressions.", {"property_id": _PID, "min_impressions": {"type": "integer"}, "limit": _LIMIT}, ["property_id"]),
    # Lighthouse depth
    _tool("get_lighthouse_human_summary", "Natural-language Lighthouse summary narrative.", {"property_id": _PID, "report_id": _RID}),
    _tool("list_lighthouse_poor_seo_pages", "Pages with Lighthouse SEO score below threshold.", {"property_id": _PID, "report_id": _RID, "seo_threshold": {"type": "integer"}, "limit": _LIMIT}),
    # Crawl depth
    _tool("get_page_analysis", "Full page_analysis JSON (schema, console errors, accessibility) for one URL.", {"url": _URL, "property_id": _PID, "report_id": _RID}, ["url"]),
    _tool("search_pages_advanced", "Search crawl with filters: status, noindex, word count, fetch method, missing title.", {"property_id": _PID, "report_id": _RID, "status": {"type": "string"}, "url_contains": {"type": "string"}, "noindex_only": {"type": "boolean"}, "missing_title": {"type": "boolean"}, "min_word_count": {"type": "integer"}, "max_word_count": {"type": "integer"}, "fetch_method": {"type": "string"}, "limit": {"type": "integer", "maximum": 50}}),
    _tool("list_pages_with_console_errors", "Rendered pages with JS console errors.", {"property_id": _PID, "report_id": _RID, "limit": _LIMIT}),
    _tool("list_pages_by_fetch_method", "Pages crawled via static or rendered fetch.", {"property_id": _PID, "report_id": _RID, "fetch_method": {"type": "string"}, "limit": _LIMIT}, ["fetch_method"]),
    _tool("get_crawl_links_table", "Paginated links table from report payload.", {"property_id": _PID, "report_id": _RID, "url_contains": {"type": "string"}, "limit": {"type": "integer", "maximum": 100}}),
    _tool("get_graph_edges_sample", "Sample of internal link graph edges.", {"property_id": _PID, "report_id": _RID, "limit": {"type": "integer", "maximum": 200}}),
    _tool("list_status_4xx_pages", "All crawled 4xx pages.", {"property_id": _PID, "report_id": _RID, "limit": _LIMIT}),
    _tool("list_status_5xx_pages", "All crawled 5xx pages.", {"property_id": _PID, "report_id": _RID, "limit": _LIMIT}),
    # Google depth
    _tool("get_ga4_page_metrics", "GA4 metrics for a landing page path or URL.", {"property_id": _PID, "path": {"type": "string"}, "url": _URL}),
    # Health depth
    _tool("get_category_health_history", "Category score trend from audit_health_snapshots.", {"property_id": _PID, "category_id": {"type": "string"}, "limit": _LIMIT}, ["property_id"]),
    # Compare slices
    _tool("compare_issue_deltas", "New and resolved issues vs baseline report.", {"baseline_report_id": _RID, "report_id": _RID, "limit": {"type": "integer", "maximum": 100}}, ["baseline_report_id"]),
    _tool("compare_category_deltas", "Category score changes vs baseline report.", {"baseline_report_id": _RID, "report_id": _RID}, ["baseline_report_id"]),
    _tool("compare_seo_health_deltas", "On-page SEO KPI changes vs baseline report.", {"baseline_report_id": _RID, "report_id": _RID}, ["baseline_report_id"]),
    _tool("compare_lighthouse_deltas", "Lighthouse score changes per URL vs baseline.", {"baseline_report_id": _RID, "report_id": _RID, "limit": _LIMIT}, ["baseline_report_id"]),
    _tool("compare_url_set_diff", "URLs added or removed from crawl vs baseline.", {"baseline_report_id": _RID, "report_id": _RID, "limit": {"type": "integer", "maximum": 200}}, ["baseline_report_id"]),
    _tool("compare_redirect_deltas", "Redirect chain changes vs baseline.", {"baseline_report_id": _RID, "report_id": _RID, "limit": {"type": "integer", "maximum": 100}}, ["baseline_report_id"]),
    _tool("compare_link_metric_deltas", "Per-URL inlink/outlink/word-count changes vs baseline.", {"baseline_report_id": _RID, "report_id": _RID, "limit": {"type": "integer", "maximum": 200}}, ["baseline_report_id"]),
]
