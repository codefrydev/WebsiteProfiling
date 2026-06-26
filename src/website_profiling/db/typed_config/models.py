"""Typed config row models (column names match PostgreSQL)."""
from __future__ import annotations

from dataclasses import dataclass, fields
from datetime import datetime
from typing import Any


SINGLETON_ID = 1


@dataclass
class LlmSettings:
    enabled: bool = False
    provider: str = "none"
    active_model: str = ""
    ollama_base_url: str = "http://127.0.0.1:11434"
    enable_ner: bool = True
    enable_keyphrases: bool = True
    enable_similar_internal: bool = True
    enable_keyword_clusters: bool = True
    enable_issue_fixes: bool = True
    enable_audit_summary: bool = True
    enable_page_coach: bool = True
    enable_content_studio: bool = True
    enable_dashboards: bool = True
    chat_assistant_name: str = "AI Assistant"
    chat_assistant_avatar_url: str = ""
    chat_unlimited_tool_rounds: bool = False
    chat_allow_crawl: bool = False
    chat_fast_narrative: bool = False
    max_pages: int = 60
    batch_size: int = 5
    concurrency: int = 2
    timeout_seconds: int = 120
    similar_top_k: int = 5


@dataclass
class LlmProviderProfile:
    provider: str
    api_key: str = ""
    saved_model: str = ""
    api_key_updated_at: datetime | None = None


@dataclass
class IntegrationSecrets:
    bing_webmaster_api_key: str = ""
    serp_api_key: str = ""
    google_rich_results_api_key: str = ""
    crawl_auth_password: str = ""
    crawl_cookies: str = ""


@dataclass
class McpSettings:
    bearer_token: str = ""
    allowed_hosts: str = ""
    allowed_origins: str = ""
    public_url: str = ""
    tool_bundle: str = "core"
    disabled_tools: str = ""
    enabled_domains: str = '["core","insight"]'


@dataclass
class FeatureFlags:
    pipeline_enabled: bool = True
    write_enabled: bool = True
    pages_md_enabled: bool = True
    chat_enabled: bool = True
    mcp_visible: bool = True
    secrets_visible: bool = True


@dataclass
class WorkspaceSettings:
    active_property_id: int | None = None
    warning_mapper_input: str = ""
    warning_mapper_input_type: str = "lighthouse"


@dataclass
class UiPreferences:
    brand_name: str = ""
    brand_subtitle: str = ""
    brand_logo_url: str = ""
    custom_theme_json: Any = None
    ui_prefs_json: Any = None


@dataclass
class ClientPreferences:
    default_landing_view: str = "overview"
    chat_fab_corner: str = "bottom-right"
    sidebar_collapsed: bool = False
    network_view_mode: str = "2d"
    content_studio_ai_enabled: bool = True
    pipeline_python_exe: str = "python3"
    pipeline_repo_root: str = ""
    radius_scale: str = "default"
    density_scale: str = "default"
    animations_enabled: bool = True
    font_size_scale: str = "default"


@dataclass
class CrawlSettings:
    start_url: str = ""
    crawl_discovery_mode: str = ""
    crawl_url_list: str = ""
    crawl_user_agent_preset: str = ""
    crawl_user_agent_custom: str = ""
    compare_mobile_desktop: str = ""
    crawl_auth_username: str = ""
    crawl_extra_headers: str = ""
    crawl_robots_txt_override: str = ""
    custom_extractors: str = ""
    max_pages: str = ""
    concurrency: str = ""
    timeout: str = ""
    max_depth: str = ""
    polite_delay: str = ""
    ignore_robots: str = ""
    allow_external: str = ""
    store_outlinks: str = ""
    store_content_excerpt: str = ""
    content_excerpt_max_chars: str = ""
    store_page_html: str = ""
    max_stored_html_bytes: str = ""
    run_content_analysis: str = ""
    content_analysis_strategy: str = ""
    content_analysis_workers: str = ""
    custom_extraction_regex: str = ""
    crawl_path_segments: str = ""
    crawl_ignore_params: str = ""
    competitor_domains: str = ""
    export_logo_url: str = ""
    preserve_crawl_history: str = ""
    crawl_stream_to_db: str = ""
    crawl_exclude_urls: str = ""
    crawl_render_mode: str = ""
    crawl_js_concurrency: str = ""
    crawl_js_timeout: str = ""
    crawl_js_wait_until: str = ""
    crawl_js_extra_wait_ms: str = ""
    crawl_js_block_resources: str = ""
    crawl_js_capture_console: str = ""
    crawl_js_console_levels: str = ""
    crawl_js_capture_failed_requests: str = ""
    crawl_js_console_max_per_page: str = ""


@dataclass
class ReportSettings:
    outbound_domain_max_rows: str = ""
    include_keyword_opportunities: str = ""
    site_name: str = ""
    report_title: str = ""
    max_fetch_for_edges: str = ""
    same_domain_only: str = ""
    max_nodes_plot: str = ""
    run_security_scan: str = ""
    security_scan_active: str = ""
    security_max_urls_probe: str = ""
    probe_image_inventory: str = ""
    max_image_probe_urls: str = ""
    image_probe_concurrency: str = ""
    image_probe_timeout: str = ""
    image_unoptimized_min_kb: str = ""
    enable_subdomain_discovery: str = ""
    subdomain_ct_lookup: str = ""
    enable_rdap_org_lookup: str = ""


@dataclass
class LighthouseSettings:
    lighthouse_url: str = ""
    lighthouse_mode: str = ""
    lighthouse_strategy: str = ""
    lighthouse_categories: str = ""
    lighthouse_iterations: str = ""
    run_lighthouse: str = ""
    run_lighthouse_on_pages: str = ""
    enable_crux: str = ""
    enable_rich_results_validation: str = ""
    enable_axe: str = ""
    enable_spell_check: str = ""
    enable_html_validation: str = ""
    enable_amp_audit: str = ""
    enable_wayback_lookup: str = ""
    lighthouse_max_pages: str = ""
    lighthouse_concurrency: str = ""


@dataclass
class ContentAnalysisSettings:
    enable_duplicate_detection: str = ""
    enable_language_detection: str = ""
    analysis_fuzzy_threshold: str = ""
    analysis_simhash_hamming: str = ""
    analysis_simhash_max_urls: str = ""
    analysis_fuzzy_max_urls: str = ""
    analysis_dup_max_pages: str = ""


@dataclass
class AuditStepSettings:
    run_crawl: str = ""
    run_report: str = ""
    run_plot: str = ""


@dataclass
class GooglePipelineSettings:
    enable_google_search_console: str = ""
    enable_google_analytics: str = ""
    google_date_range_days: str = ""
    google_url_gap_list_limit: str = ""
    enrich_keywords_after_report: str = ""
    enable_google_keyword_planner: str = ""
    enable_keyword_forecast: str = ""
    google_ads_language_id: str = ""
    google_ads_geo_ids: str = ""


@dataclass
class KeywordSettings:
    keyword_max_pages: str = ""
    keyword_gsc_max_rows: str = ""
    brand_name: str = ""
    keyword_seeds: str = ""
    enable_google_suggest: str = ""
    enable_google_trends: str = ""
    enable_wikipedia_topic: str = ""
    enable_datamuse: str = ""
    keyword_suggest_top_n: str = ""
    keyword_max_suggest_results: str = ""


PIPELINE_DOMAIN_MODELS: dict[str, type[Any]] = {
    "crawl_settings": CrawlSettings,
    "report_settings": ReportSettings,
    "lighthouse_settings": LighthouseSettings,
    "content_analysis_settings": ContentAnalysisSettings,
    "audit_step_settings": AuditStepSettings,
    "google_pipeline_settings": GooglePipelineSettings,
    "keyword_settings": KeywordSettings,
}

SINGLETON_MODELS: dict[str, type[Any]] = {
    "llm_settings": LlmSettings,
    "integration_secrets": IntegrationSecrets,
    "mcp_settings": McpSettings,
    "feature_flags": FeatureFlags,
    "workspace_settings": WorkspaceSettings,
    "ui_preferences": UiPreferences,
}


def dataclass_columns(model_cls: type[Any]) -> tuple[str, ...]:
    return tuple(f.name for f in fields(model_cls))
