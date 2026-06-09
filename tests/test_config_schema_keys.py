"""Example config keys must match the documented schema set."""
from __future__ import annotations

from pathlib import Path

from tests.config_test_utils import REPO_ROOT, parse_config_keys

# Mirrors web/src/lib/pipelineConfigSchema.ts ALL_SCHEMA_KEYS (update when schema changes).
SCHEMA_KEYS = {
    "start_url",
    "max_pages",
    "concurrency",
    "timeout",
    "max_depth",
    "polite_delay",
    "ignore_robots",
    "allow_external",
    "store_outlinks",
    "store_content_excerpt",
    "content_excerpt_max_chars",
    "preserve_crawl_history",
    "crawl_stream_to_db",
    "crawl_exclude_urls",
    "crawl_discovery_mode",
    "crawl_url_list",
    "crawl_user_agent_preset",
    "crawl_user_agent_custom",
    "crawl_auth_username",
    "crawl_auth_password",
    "crawl_extra_headers",
    "crawl_cookies",
    "crawl_robots_txt_override",
    "custom_extractors",
    "crawl_render_mode",
    "crawl_js_concurrency",
    "crawl_js_timeout",
    "crawl_js_wait_until",
    "crawl_js_extra_wait_ms",
    "crawl_js_block_resources",
    "crawl_js_capture_console",
    "crawl_js_console_levels",
    "crawl_js_capture_failed_requests",
    "crawl_js_console_max_per_page",
    "outbound_domain_max_rows",
    "include_keyword_opportunities",
    "site_name",
    "report_title",
    "max_fetch_for_edges",
    "same_domain_only",
    "max_nodes_plot",
    "run_security_scan",
    "security_scan_active",
    "security_max_urls_probe",
    "probe_image_inventory",
    "max_image_probe_urls",
    "image_probe_concurrency",
    "image_probe_timeout",
    "image_unoptimized_min_kb",
    "lighthouse_url",
    "lighthouse_mode",
    "lighthouse_strategy",
    "lighthouse_categories",
    "lighthouse_iterations",
    "run_lighthouse",
    "run_lighthouse_on_pages",
    "enable_crux",
    "enable_rich_results_validation",
    "google_rich_results_api_key",
    "enable_axe",
    "enable_spell_check",
    "enable_html_validation",
    "enable_amp_audit",
    "enable_wayback_lookup",
    "competitor_domains",
    "bing_webmaster_api_key",
    "serp_api_key",
    "export_logo_url",
    "custom_extraction_regex",
    "crawl_path_segments",
    "crawl_ignore_params",
    "lighthouse_max_pages",
    "lighthouse_concurrency",
    "enable_duplicate_detection",
    "enable_language_detection",
    "analysis_fuzzy_threshold",
    "analysis_simhash_hamming",
    "analysis_dup_max_pages",
    "run_crawl",
    "run_report",
    "run_plot",
    "enable_google_search_console",
    "enable_google_analytics",
    "google_date_range_days",
    "google_url_gap_list_limit",
    "enable_subdomain_discovery",
    "subdomain_ct_lookup",
    "enable_rdap_org_lookup",
    "enrich_keywords_after_report",
    "keyword_max_pages",
    "keyword_gsc_max_rows",
    "brand_name",
    "keyword_seeds",
    "enable_google_suggest",
    "enable_google_trends",
    "enable_wikipedia_topic",
    "enable_datamuse",
    "keyword_suggest_top_n",
    "keyword_max_suggest_results",
    "warning_mapper_input",
    "warning_mapper_input_type",
    "active_property_id",
}


def test_input_example_keys_are_subset_of_schema():
    keys = parse_config_keys(REPO_ROOT / "input.txt.example")
    extra = keys - SCHEMA_KEYS
    assert not extra, f"Keys in input.txt.example not in schema: {sorted(extra)}"


def test_pipeline_example_keys_are_subset_of_schema():
    keys = parse_config_keys(REPO_ROOT / "pipeline-config.example.txt")
    extra = keys - SCHEMA_KEYS
    assert not extra, f"pipeline-config.example.txt has unknown keys: {sorted(extra)}"


def test_schema_keys_documented_or_optional_in_example():
    keys = parse_config_keys(REPO_ROOT / "pipeline-config.example.txt")
    # Tristate 'auto' keys may be omitted from static examples (UI omits them when auto).
    optional_omitted = {
        "enrich_keywords_after_report",
        "active_property_id",
        "enable_subdomain_discovery",
        "subdomain_ct_lookup",
        "enable_rdap_org_lookup",
    }
    missing = SCHEMA_KEYS - keys - optional_omitted
    assert not missing, f"pipeline-config.example.txt missing keys: {sorted(missing)}"
