"""Typed config tables replacing llm_config, pipeline_config, app_settings EAV.

Revision ID: 026_typed_config
Revises: 025_pipeline_job_queue
"""
from __future__ import annotations

from alembic import op

revision = "026_typed_config"
down_revision = "025_pipeline_job_queue"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
CREATE TABLE llm_settings (
    id BIGINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    enabled BOOLEAN NOT NULL DEFAULT false,
    provider TEXT NOT NULL DEFAULT 'none',
    active_model TEXT NOT NULL DEFAULT '',
    ollama_base_url TEXT NOT NULL DEFAULT 'http://127.0.0.1:11434',
    enable_ner BOOLEAN NOT NULL DEFAULT true,
    enable_keyphrases BOOLEAN NOT NULL DEFAULT true,
    enable_similar_internal BOOLEAN NOT NULL DEFAULT true,
    enable_keyword_clusters BOOLEAN NOT NULL DEFAULT true,
    enable_issue_fixes BOOLEAN NOT NULL DEFAULT true,
    enable_audit_summary BOOLEAN NOT NULL DEFAULT true,
    enable_page_coach BOOLEAN NOT NULL DEFAULT true,
    enable_content_studio BOOLEAN NOT NULL DEFAULT true,
    enable_dashboards BOOLEAN NOT NULL DEFAULT true,
    chat_assistant_name TEXT NOT NULL DEFAULT 'AI Assistant',
    chat_assistant_avatar_url TEXT NOT NULL DEFAULT '',
    chat_unlimited_tool_rounds BOOLEAN NOT NULL DEFAULT false,
    chat_allow_crawl BOOLEAN NOT NULL DEFAULT false,
    chat_fast_narrative BOOLEAN NOT NULL DEFAULT false,
    max_pages INTEGER NOT NULL DEFAULT 60,
    batch_size INTEGER NOT NULL DEFAULT 5,
    concurrency INTEGER NOT NULL DEFAULT 2,
    timeout_seconds INTEGER NOT NULL DEFAULT 120,
    similar_top_k INTEGER NOT NULL DEFAULT 5,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO llm_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE llm_provider_profiles (
    provider TEXT PRIMARY KEY,
    api_key TEXT NOT NULL DEFAULT '',
    saved_model TEXT NOT NULL DEFAULT '',
    api_key_updated_at TIMESTAMPTZ
);

CREATE TABLE integration_secrets (
    id BIGINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    bing_webmaster_api_key TEXT NOT NULL DEFAULT '',
    serp_api_key TEXT NOT NULL DEFAULT '',
    google_rich_results_api_key TEXT NOT NULL DEFAULT '',
    crawl_auth_password TEXT NOT NULL DEFAULT '',
    crawl_cookies TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO integration_secrets (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE mcp_settings (
    id BIGINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    bearer_token TEXT NOT NULL DEFAULT '',
    allowed_hosts TEXT NOT NULL DEFAULT '',
    allowed_origins TEXT NOT NULL DEFAULT '',
    public_url TEXT NOT NULL DEFAULT '',
    tool_bundle TEXT NOT NULL DEFAULT 'core',
    disabled_tools TEXT NOT NULL DEFAULT '',
    enabled_domains TEXT NOT NULL DEFAULT '["core","insight"]',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO mcp_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE feature_flags (
    id BIGINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    pipeline_enabled BOOLEAN NOT NULL DEFAULT true,
    write_enabled BOOLEAN NOT NULL DEFAULT true,
    pages_md_enabled BOOLEAN NOT NULL DEFAULT true,
    chat_enabled BOOLEAN NOT NULL DEFAULT true,
    mcp_visible BOOLEAN NOT NULL DEFAULT true,
    secrets_visible BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO feature_flags (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE workspace_settings (
    id BIGINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    active_property_id INTEGER NULL,
    warning_mapper_input TEXT NOT NULL DEFAULT '',
    warning_mapper_input_type TEXT NOT NULL DEFAULT 'lighthouse',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO workspace_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE ui_preferences (
    id BIGINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    brand_name TEXT NOT NULL DEFAULT '',
    brand_subtitle TEXT NOT NULL DEFAULT '',
    brand_logo_url TEXT NOT NULL DEFAULT '',
    custom_theme_json JSONB NULL,
    ui_prefs_json JSONB NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO ui_preferences (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE crawl_settings (
    id BIGINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    start_url TEXT NOT NULL DEFAULT '',
    crawl_discovery_mode TEXT NOT NULL DEFAULT '',
    crawl_url_list TEXT NOT NULL DEFAULT '',
    crawl_user_agent_preset TEXT NOT NULL DEFAULT '',
    crawl_user_agent_custom TEXT NOT NULL DEFAULT '',
    compare_mobile_desktop TEXT NOT NULL DEFAULT '',
    crawl_auth_username TEXT NOT NULL DEFAULT '',
    crawl_extra_headers TEXT NOT NULL DEFAULT '',
    crawl_robots_txt_override TEXT NOT NULL DEFAULT '',
    custom_extractors TEXT NOT NULL DEFAULT '',
    max_pages TEXT NOT NULL DEFAULT '',
    concurrency TEXT NOT NULL DEFAULT '',
    timeout TEXT NOT NULL DEFAULT '',
    max_depth TEXT NOT NULL DEFAULT '',
    polite_delay TEXT NOT NULL DEFAULT '',
    ignore_robots TEXT NOT NULL DEFAULT '',
    allow_external TEXT NOT NULL DEFAULT '',
    store_outlinks TEXT NOT NULL DEFAULT '',
    store_content_excerpt TEXT NOT NULL DEFAULT '',
    content_excerpt_max_chars TEXT NOT NULL DEFAULT '',
    store_page_html TEXT NOT NULL DEFAULT '',
    max_stored_html_bytes TEXT NOT NULL DEFAULT '',
    run_content_analysis TEXT NOT NULL DEFAULT '',
    content_analysis_strategy TEXT NOT NULL DEFAULT '',
    content_analysis_workers TEXT NOT NULL DEFAULT '',
    custom_extraction_regex TEXT NOT NULL DEFAULT '',
    crawl_path_segments TEXT NOT NULL DEFAULT '',
    crawl_ignore_params TEXT NOT NULL DEFAULT '',
    competitor_domains TEXT NOT NULL DEFAULT '',
    export_logo_url TEXT NOT NULL DEFAULT '',
    preserve_crawl_history TEXT NOT NULL DEFAULT '',
    crawl_stream_to_db TEXT NOT NULL DEFAULT '',
    crawl_exclude_urls TEXT NOT NULL DEFAULT '',
    crawl_render_mode TEXT NOT NULL DEFAULT '',
    crawl_js_concurrency TEXT NOT NULL DEFAULT '',
    crawl_js_timeout TEXT NOT NULL DEFAULT '',
    crawl_js_wait_until TEXT NOT NULL DEFAULT '',
    crawl_js_extra_wait_ms TEXT NOT NULL DEFAULT '',
    crawl_js_block_resources TEXT NOT NULL DEFAULT '',
    crawl_js_capture_console TEXT NOT NULL DEFAULT '',
    crawl_js_console_levels TEXT NOT NULL DEFAULT '',
    crawl_js_capture_failed_requests TEXT NOT NULL DEFAULT '',
    crawl_js_console_max_per_page TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO crawl_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE report_settings (
    id BIGINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    outbound_domain_max_rows TEXT NOT NULL DEFAULT '',
    include_keyword_opportunities TEXT NOT NULL DEFAULT '',
    site_name TEXT NOT NULL DEFAULT '',
    report_title TEXT NOT NULL DEFAULT '',
    max_fetch_for_edges TEXT NOT NULL DEFAULT '',
    same_domain_only TEXT NOT NULL DEFAULT '',
    max_nodes_plot TEXT NOT NULL DEFAULT '',
    run_security_scan TEXT NOT NULL DEFAULT '',
    security_scan_active TEXT NOT NULL DEFAULT '',
    security_max_urls_probe TEXT NOT NULL DEFAULT '',
    probe_image_inventory TEXT NOT NULL DEFAULT '',
    max_image_probe_urls TEXT NOT NULL DEFAULT '',
    image_probe_concurrency TEXT NOT NULL DEFAULT '',
    image_probe_timeout TEXT NOT NULL DEFAULT '',
    image_unoptimized_min_kb TEXT NOT NULL DEFAULT '',
    enable_subdomain_discovery TEXT NOT NULL DEFAULT '',
    subdomain_ct_lookup TEXT NOT NULL DEFAULT '',
    enable_rdap_org_lookup TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO report_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE lighthouse_settings (
    id BIGINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    lighthouse_url TEXT NOT NULL DEFAULT '',
    lighthouse_mode TEXT NOT NULL DEFAULT '',
    lighthouse_strategy TEXT NOT NULL DEFAULT '',
    lighthouse_categories TEXT NOT NULL DEFAULT '',
    lighthouse_iterations TEXT NOT NULL DEFAULT '',
    run_lighthouse TEXT NOT NULL DEFAULT '',
    run_lighthouse_on_pages TEXT NOT NULL DEFAULT '',
    enable_crux TEXT NOT NULL DEFAULT '',
    enable_rich_results_validation TEXT NOT NULL DEFAULT '',
    enable_axe TEXT NOT NULL DEFAULT '',
    enable_spell_check TEXT NOT NULL DEFAULT '',
    enable_html_validation TEXT NOT NULL DEFAULT '',
    enable_amp_audit TEXT NOT NULL DEFAULT '',
    enable_wayback_lookup TEXT NOT NULL DEFAULT '',
    lighthouse_max_pages TEXT NOT NULL DEFAULT '',
    lighthouse_concurrency TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO lighthouse_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE content_analysis_settings (
    id BIGINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    enable_duplicate_detection TEXT NOT NULL DEFAULT '',
    enable_language_detection TEXT NOT NULL DEFAULT '',
    analysis_fuzzy_threshold TEXT NOT NULL DEFAULT '',
    analysis_simhash_hamming TEXT NOT NULL DEFAULT '',
    analysis_simhash_max_urls TEXT NOT NULL DEFAULT '',
    analysis_fuzzy_max_urls TEXT NOT NULL DEFAULT '',
    analysis_dup_max_pages TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO content_analysis_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE audit_step_settings (
    id BIGINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    run_crawl TEXT NOT NULL DEFAULT '',
    run_report TEXT NOT NULL DEFAULT '',
    run_plot TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO audit_step_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE google_pipeline_settings (
    id BIGINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    enable_google_search_console TEXT NOT NULL DEFAULT '',
    enable_google_analytics TEXT NOT NULL DEFAULT '',
    google_date_range_days TEXT NOT NULL DEFAULT '',
    google_url_gap_list_limit TEXT NOT NULL DEFAULT '',
    enrich_keywords_after_report TEXT NOT NULL DEFAULT '',
    enable_google_keyword_planner TEXT NOT NULL DEFAULT '',
    enable_keyword_forecast TEXT NOT NULL DEFAULT '',
    google_ads_language_id TEXT NOT NULL DEFAULT '',
    google_ads_geo_ids TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO google_pipeline_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE keyword_settings (
    id BIGINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    keyword_max_pages TEXT NOT NULL DEFAULT '',
    keyword_gsc_max_rows TEXT NOT NULL DEFAULT '',
    brand_name TEXT NOT NULL DEFAULT '',
    keyword_seeds TEXT NOT NULL DEFAULT '',
    enable_google_suggest TEXT NOT NULL DEFAULT '',
    enable_google_trends TEXT NOT NULL DEFAULT '',
    enable_wikipedia_topic TEXT NOT NULL DEFAULT '',
    enable_datamuse TEXT NOT NULL DEFAULT '',
    keyword_suggest_top_n TEXT NOT NULL DEFAULT '',
    keyword_max_suggest_results TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO keyword_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

UPDATE llm_settings SET enabled = COALESCE((SELECT LOWER(TRIM(value)) IN ('true','1','yes') FROM llm_config WHERE key = 'llm_enabled'), enabled), provider = COALESCE((SELECT NULLIF(TRIM(value), '') FROM llm_config WHERE key = 'llm_provider'), 'none'), active_model = COALESCE((SELECT NULLIF(TRIM(value), '') FROM llm_config WHERE key = 'llm_model'), ''), ollama_base_url = COALESCE((SELECT NULLIF(TRIM(value), '') FROM llm_config WHERE key = 'llm_base_url'), 'http://127.0.0.1:11434'), enable_ner = COALESCE((SELECT LOWER(TRIM(value)) IN ('true','1','yes') FROM llm_config WHERE key = 'llm_enable_ner'), enable_ner), enable_keyphrases = COALESCE((SELECT LOWER(TRIM(value)) IN ('true','1','yes') FROM llm_config WHERE key = 'llm_enable_keyphrases'), enable_keyphrases), enable_similar_internal = COALESCE((SELECT LOWER(TRIM(value)) IN ('true','1','yes') FROM llm_config WHERE key = 'llm_enable_similar_internal'), enable_similar_internal), enable_keyword_clusters = COALESCE((SELECT LOWER(TRIM(value)) IN ('true','1','yes') FROM llm_config WHERE key = 'llm_enable_keyword_clusters'), enable_keyword_clusters), enable_issue_fixes = COALESCE((SELECT LOWER(TRIM(value)) IN ('true','1','yes') FROM llm_config WHERE key = 'llm_enable_issue_fixes'), enable_issue_fixes), enable_audit_summary = COALESCE((SELECT LOWER(TRIM(value)) IN ('true','1','yes') FROM llm_config WHERE key = 'llm_enable_audit_summary'), enable_audit_summary), enable_page_coach = COALESCE((SELECT LOWER(TRIM(value)) IN ('true','1','yes') FROM llm_config WHERE key = 'llm_enable_page_coach'), enable_page_coach), enable_content_studio = COALESCE((SELECT LOWER(TRIM(value)) IN ('true','1','yes') FROM llm_config WHERE key = 'llm_enable_content_studio'), enable_content_studio), enable_dashboards = COALESCE((SELECT LOWER(TRIM(value)) IN ('true','1','yes') FROM llm_config WHERE key = 'llm_enable_dashboards'), enable_dashboards), chat_assistant_name = COALESCE((SELECT NULLIF(TRIM(value), '') FROM llm_config WHERE key = 'llm_chat_assistant_name'), 'AI Assistant'), chat_assistant_avatar_url = COALESCE((SELECT NULLIF(TRIM(value), '') FROM llm_config WHERE key = 'llm_chat_assistant_avatar_url'), ''), chat_unlimited_tool_rounds = COALESCE((SELECT LOWER(TRIM(value)) IN ('true','1','yes') FROM llm_config WHERE key = 'llm_chat_unlimited_tool_rounds'), chat_unlimited_tool_rounds), chat_allow_crawl = COALESCE((SELECT LOWER(TRIM(value)) IN ('true','1','yes') FROM llm_config WHERE key = 'llm_chat_allow_crawl'), chat_allow_crawl), chat_fast_narrative = COALESCE((SELECT LOWER(TRIM(value)) IN ('true','1','yes') FROM llm_config WHERE key = 'llm_chat_fast_narrative'), chat_fast_narrative), max_pages = COALESCE((SELECT NULLIF(TRIM(value), '')::INTEGER FROM llm_config WHERE key = 'llm_max_pages'), max_pages), batch_size = COALESCE((SELECT NULLIF(TRIM(value), '')::INTEGER FROM llm_config WHERE key = 'llm_batch_size'), batch_size), concurrency = COALESCE((SELECT NULLIF(TRIM(value), '')::INTEGER FROM llm_config WHERE key = 'llm_concurrency'), concurrency), timeout_seconds = COALESCE((SELECT NULLIF(TRIM(value), '')::INTEGER FROM llm_config WHERE key = 'llm_timeout_s'), timeout_seconds), similar_top_k = COALESCE((SELECT NULLIF(TRIM(value), '')::INTEGER FROM llm_config WHERE key = 'llm_similar_top_k'), similar_top_k) WHERE id = 1;

INSERT INTO llm_provider_profiles (provider, api_key, saved_model, api_key_updated_at)
SELECT p.provider,
       COALESCE((SELECT value FROM llm_config WHERE key = 'llm_api_key_' || p.provider), ''),
       COALESCE((SELECT value FROM llm_config WHERE key = 'llm_model_' || p.provider), ''),
       (SELECT updated_at FROM llm_config WHERE key = 'llm_api_key_' || p.provider)
FROM (VALUES ('openai'), ('gemini'), ('anthropic'), ('groq'), ('ollama')) AS p(provider)
ON CONFLICT (provider) DO UPDATE SET
    api_key = EXCLUDED.api_key,
    saved_model = EXCLUDED.saved_model,
    api_key_updated_at = EXCLUDED.api_key_updated_at;

UPDATE llm_provider_profiles SET api_key = (SELECT value FROM llm_config WHERE key = 'llm_api_key')
WHERE provider = (SELECT LOWER(TRIM(provider)) FROM llm_settings WHERE id = 1)
  AND EXISTS (SELECT 1 FROM llm_config WHERE key = 'llm_api_key' AND NULLIF(TRIM(value), '') IS NOT NULL)
  AND NULLIF(TRIM(api_key), '') IS NULL;

UPDATE integration_secrets SET bing_webmaster_api_key = COALESCE((SELECT value FROM pipeline_config WHERE key = 'bing_webmaster_api_key'), bing_webmaster_api_key), serp_api_key = COALESCE((SELECT value FROM pipeline_config WHERE key = 'serp_api_key'), serp_api_key), google_rich_results_api_key = COALESCE((SELECT value FROM pipeline_config WHERE key = 'google_rich_results_api_key'), google_rich_results_api_key), crawl_auth_password = COALESCE((SELECT value FROM pipeline_config WHERE key = 'crawl_auth_password'), crawl_auth_password), crawl_cookies = COALESCE((SELECT value FROM pipeline_config WHERE key = 'crawl_cookies'), crawl_cookies) WHERE id = 1;

UPDATE mcp_settings SET bearer_token = COALESCE((SELECT value FROM pipeline_config WHERE key = 'mcp_token'), bearer_token), allowed_hosts = COALESCE((SELECT value FROM pipeline_config WHERE key = 'mcp_allowed_hosts'), allowed_hosts), allowed_origins = COALESCE((SELECT value FROM pipeline_config WHERE key = 'mcp_allowed_origins'), allowed_origins), public_url = COALESCE((SELECT value FROM pipeline_config WHERE key = 'mcp_public_url'), public_url), tool_bundle = COALESCE((SELECT value FROM pipeline_config WHERE key = 'mcp_domain'), tool_bundle), disabled_tools = COALESCE((SELECT value FROM pipeline_config WHERE key = 'mcp_disabled_tools'), disabled_tools), enabled_domains = COALESCE((SELECT value FROM pipeline_config WHERE key = 'mcp_enabled_domains'), enabled_domains) WHERE id = 1;

UPDATE feature_flags SET pipeline_enabled = COALESCE((SELECT LOWER(TRIM(value)) IN ('true','1','yes') FROM pipeline_config WHERE key = 'feature_pipeline_enabled'), pipeline_enabled), write_enabled = COALESCE((SELECT LOWER(TRIM(value)) IN ('true','1','yes') FROM pipeline_config WHERE key = 'feature_write_enabled'), write_enabled), pages_md_enabled = COALESCE((SELECT LOWER(TRIM(value)) IN ('true','1','yes') FROM pipeline_config WHERE key = 'feature_pages_md_enabled'), pages_md_enabled), chat_enabled = COALESCE((SELECT LOWER(TRIM(value)) IN ('true','1','yes') FROM pipeline_config WHERE key = 'feature_chat_enabled'), chat_enabled), mcp_visible = COALESCE((SELECT LOWER(TRIM(value)) IN ('true','1','yes') FROM pipeline_config WHERE key = 'feature_mcp_visible'), mcp_visible), secrets_visible = COALESCE((SELECT LOWER(TRIM(value)) IN ('true','1','yes') FROM pipeline_config WHERE key = 'feature_secrets_visible'), secrets_visible) WHERE id = 1;

UPDATE workspace_settings SET active_property_id = (SELECT NULLIF(TRIM(value), '')::INTEGER FROM pipeline_config WHERE key = 'active_property_id' AND is_unknown = false), warning_mapper_input = COALESCE((SELECT value FROM pipeline_config WHERE key = 'warning_mapper_input'), warning_mapper_input), warning_mapper_input_type = COALESCE((SELECT value FROM pipeline_config WHERE key = 'warning_mapper_input_type'), warning_mapper_input_type) WHERE id = 1;

UPDATE ui_preferences SET brand_name = COALESCE((SELECT value FROM app_settings WHERE key = 'brand_name'), brand_name), brand_subtitle = COALESCE((SELECT value FROM app_settings WHERE key = 'brand_subtitle'), brand_subtitle), brand_logo_url = COALESCE((SELECT value FROM app_settings WHERE key = 'brand_logo_url'), brand_logo_url), custom_theme_json = (SELECT NULLIF(TRIM(value), '')::JSONB FROM app_settings WHERE key = 'custom_theme'), ui_prefs_json = (SELECT NULLIF(TRIM(value), '')::JSONB FROM app_settings WHERE key = 'ui_prefs') WHERE id = 1;

UPDATE crawl_settings SET start_url = COALESCE((SELECT value FROM pipeline_config WHERE key = 'start_url' AND is_unknown = false), start_url), crawl_discovery_mode = COALESCE((SELECT value FROM pipeline_config WHERE key = 'crawl_discovery_mode' AND is_unknown = false), crawl_discovery_mode), crawl_url_list = COALESCE((SELECT value FROM pipeline_config WHERE key = 'crawl_url_list' AND is_unknown = false), crawl_url_list), crawl_user_agent_preset = COALESCE((SELECT value FROM pipeline_config WHERE key = 'crawl_user_agent_preset' AND is_unknown = false), crawl_user_agent_preset), crawl_user_agent_custom = COALESCE((SELECT value FROM pipeline_config WHERE key = 'crawl_user_agent_custom' AND is_unknown = false), crawl_user_agent_custom), compare_mobile_desktop = COALESCE((SELECT value FROM pipeline_config WHERE key = 'compare_mobile_desktop' AND is_unknown = false), compare_mobile_desktop), crawl_auth_username = COALESCE((SELECT value FROM pipeline_config WHERE key = 'crawl_auth_username' AND is_unknown = false), crawl_auth_username), crawl_extra_headers = COALESCE((SELECT value FROM pipeline_config WHERE key = 'crawl_extra_headers' AND is_unknown = false), crawl_extra_headers), crawl_robots_txt_override = COALESCE((SELECT value FROM pipeline_config WHERE key = 'crawl_robots_txt_override' AND is_unknown = false), crawl_robots_txt_override), custom_extractors = COALESCE((SELECT value FROM pipeline_config WHERE key = 'custom_extractors' AND is_unknown = false), custom_extractors), max_pages = COALESCE((SELECT value FROM pipeline_config WHERE key = 'max_pages' AND is_unknown = false), max_pages), concurrency = COALESCE((SELECT value FROM pipeline_config WHERE key = 'concurrency' AND is_unknown = false), concurrency), timeout = COALESCE((SELECT value FROM pipeline_config WHERE key = 'timeout' AND is_unknown = false), timeout), max_depth = COALESCE((SELECT value FROM pipeline_config WHERE key = 'max_depth' AND is_unknown = false), max_depth), polite_delay = COALESCE((SELECT value FROM pipeline_config WHERE key = 'polite_delay' AND is_unknown = false), polite_delay), ignore_robots = COALESCE((SELECT value FROM pipeline_config WHERE key = 'ignore_robots' AND is_unknown = false), ignore_robots), allow_external = COALESCE((SELECT value FROM pipeline_config WHERE key = 'allow_external' AND is_unknown = false), allow_external), store_outlinks = COALESCE((SELECT value FROM pipeline_config WHERE key = 'store_outlinks' AND is_unknown = false), store_outlinks), store_content_excerpt = COALESCE((SELECT value FROM pipeline_config WHERE key = 'store_content_excerpt' AND is_unknown = false), store_content_excerpt), content_excerpt_max_chars = COALESCE((SELECT value FROM pipeline_config WHERE key = 'content_excerpt_max_chars' AND is_unknown = false), content_excerpt_max_chars), store_page_html = COALESCE((SELECT value FROM pipeline_config WHERE key = 'store_page_html' AND is_unknown = false), store_page_html), max_stored_html_bytes = COALESCE((SELECT value FROM pipeline_config WHERE key = 'max_stored_html_bytes' AND is_unknown = false), max_stored_html_bytes), run_content_analysis = COALESCE((SELECT value FROM pipeline_config WHERE key = 'run_content_analysis' AND is_unknown = false), run_content_analysis), content_analysis_strategy = COALESCE((SELECT value FROM pipeline_config WHERE key = 'content_analysis_strategy' AND is_unknown = false), content_analysis_strategy), content_analysis_workers = COALESCE((SELECT value FROM pipeline_config WHERE key = 'content_analysis_workers' AND is_unknown = false), content_analysis_workers), custom_extraction_regex = COALESCE((SELECT value FROM pipeline_config WHERE key = 'custom_extraction_regex' AND is_unknown = false), custom_extraction_regex), crawl_path_segments = COALESCE((SELECT value FROM pipeline_config WHERE key = 'crawl_path_segments' AND is_unknown = false), crawl_path_segments), crawl_ignore_params = COALESCE((SELECT value FROM pipeline_config WHERE key = 'crawl_ignore_params' AND is_unknown = false), crawl_ignore_params), competitor_domains = COALESCE((SELECT value FROM pipeline_config WHERE key = 'competitor_domains' AND is_unknown = false), competitor_domains), export_logo_url = COALESCE((SELECT value FROM pipeline_config WHERE key = 'export_logo_url' AND is_unknown = false), export_logo_url), preserve_crawl_history = COALESCE((SELECT value FROM pipeline_config WHERE key = 'preserve_crawl_history' AND is_unknown = false), preserve_crawl_history), crawl_stream_to_db = COALESCE((SELECT value FROM pipeline_config WHERE key = 'crawl_stream_to_db' AND is_unknown = false), crawl_stream_to_db), crawl_exclude_urls = COALESCE((SELECT value FROM pipeline_config WHERE key = 'crawl_exclude_urls' AND is_unknown = false), crawl_exclude_urls), crawl_render_mode = COALESCE((SELECT value FROM pipeline_config WHERE key = 'crawl_render_mode' AND is_unknown = false), crawl_render_mode), crawl_js_concurrency = COALESCE((SELECT value FROM pipeline_config WHERE key = 'crawl_js_concurrency' AND is_unknown = false), crawl_js_concurrency), crawl_js_timeout = COALESCE((SELECT value FROM pipeline_config WHERE key = 'crawl_js_timeout' AND is_unknown = false), crawl_js_timeout), crawl_js_wait_until = COALESCE((SELECT value FROM pipeline_config WHERE key = 'crawl_js_wait_until' AND is_unknown = false), crawl_js_wait_until), crawl_js_extra_wait_ms = COALESCE((SELECT value FROM pipeline_config WHERE key = 'crawl_js_extra_wait_ms' AND is_unknown = false), crawl_js_extra_wait_ms), crawl_js_block_resources = COALESCE((SELECT value FROM pipeline_config WHERE key = 'crawl_js_block_resources' AND is_unknown = false), crawl_js_block_resources), crawl_js_capture_console = COALESCE((SELECT value FROM pipeline_config WHERE key = 'crawl_js_capture_console' AND is_unknown = false), crawl_js_capture_console), crawl_js_console_levels = COALESCE((SELECT value FROM pipeline_config WHERE key = 'crawl_js_console_levels' AND is_unknown = false), crawl_js_console_levels), crawl_js_capture_failed_requests = COALESCE((SELECT value FROM pipeline_config WHERE key = 'crawl_js_capture_failed_requests' AND is_unknown = false), crawl_js_capture_failed_requests), crawl_js_console_max_per_page = COALESCE((SELECT value FROM pipeline_config WHERE key = 'crawl_js_console_max_per_page' AND is_unknown = false), crawl_js_console_max_per_page) WHERE id = 1;

UPDATE report_settings SET outbound_domain_max_rows = COALESCE((SELECT value FROM pipeline_config WHERE key = 'outbound_domain_max_rows' AND is_unknown = false), outbound_domain_max_rows), include_keyword_opportunities = COALESCE((SELECT value FROM pipeline_config WHERE key = 'include_keyword_opportunities' AND is_unknown = false), include_keyword_opportunities), site_name = COALESCE((SELECT value FROM pipeline_config WHERE key = 'site_name' AND is_unknown = false), site_name), report_title = COALESCE((SELECT value FROM pipeline_config WHERE key = 'report_title' AND is_unknown = false), report_title), max_fetch_for_edges = COALESCE((SELECT value FROM pipeline_config WHERE key = 'max_fetch_for_edges' AND is_unknown = false), max_fetch_for_edges), same_domain_only = COALESCE((SELECT value FROM pipeline_config WHERE key = 'same_domain_only' AND is_unknown = false), same_domain_only), max_nodes_plot = COALESCE((SELECT value FROM pipeline_config WHERE key = 'max_nodes_plot' AND is_unknown = false), max_nodes_plot), run_security_scan = COALESCE((SELECT value FROM pipeline_config WHERE key = 'run_security_scan' AND is_unknown = false), run_security_scan), security_scan_active = COALESCE((SELECT value FROM pipeline_config WHERE key = 'security_scan_active' AND is_unknown = false), security_scan_active), security_max_urls_probe = COALESCE((SELECT value FROM pipeline_config WHERE key = 'security_max_urls_probe' AND is_unknown = false), security_max_urls_probe), probe_image_inventory = COALESCE((SELECT value FROM pipeline_config WHERE key = 'probe_image_inventory' AND is_unknown = false), probe_image_inventory), max_image_probe_urls = COALESCE((SELECT value FROM pipeline_config WHERE key = 'max_image_probe_urls' AND is_unknown = false), max_image_probe_urls), image_probe_concurrency = COALESCE((SELECT value FROM pipeline_config WHERE key = 'image_probe_concurrency' AND is_unknown = false), image_probe_concurrency), image_probe_timeout = COALESCE((SELECT value FROM pipeline_config WHERE key = 'image_probe_timeout' AND is_unknown = false), image_probe_timeout), image_unoptimized_min_kb = COALESCE((SELECT value FROM pipeline_config WHERE key = 'image_unoptimized_min_kb' AND is_unknown = false), image_unoptimized_min_kb), enable_subdomain_discovery = COALESCE((SELECT value FROM pipeline_config WHERE key = 'enable_subdomain_discovery' AND is_unknown = false), enable_subdomain_discovery), subdomain_ct_lookup = COALESCE((SELECT value FROM pipeline_config WHERE key = 'subdomain_ct_lookup' AND is_unknown = false), subdomain_ct_lookup), enable_rdap_org_lookup = COALESCE((SELECT value FROM pipeline_config WHERE key = 'enable_rdap_org_lookup' AND is_unknown = false), enable_rdap_org_lookup) WHERE id = 1;

UPDATE lighthouse_settings SET lighthouse_url = COALESCE((SELECT value FROM pipeline_config WHERE key = 'lighthouse_url' AND is_unknown = false), lighthouse_url), lighthouse_mode = COALESCE((SELECT value FROM pipeline_config WHERE key = 'lighthouse_mode' AND is_unknown = false), lighthouse_mode), lighthouse_strategy = COALESCE((SELECT value FROM pipeline_config WHERE key = 'lighthouse_strategy' AND is_unknown = false), lighthouse_strategy), lighthouse_categories = COALESCE((SELECT value FROM pipeline_config WHERE key = 'lighthouse_categories' AND is_unknown = false), lighthouse_categories), lighthouse_iterations = COALESCE((SELECT value FROM pipeline_config WHERE key = 'lighthouse_iterations' AND is_unknown = false), lighthouse_iterations), run_lighthouse = COALESCE((SELECT value FROM pipeline_config WHERE key = 'run_lighthouse' AND is_unknown = false), run_lighthouse), run_lighthouse_on_pages = COALESCE((SELECT value FROM pipeline_config WHERE key = 'run_lighthouse_on_pages' AND is_unknown = false), run_lighthouse_on_pages), enable_crux = COALESCE((SELECT value FROM pipeline_config WHERE key = 'enable_crux' AND is_unknown = false), enable_crux), enable_rich_results_validation = COALESCE((SELECT value FROM pipeline_config WHERE key = 'enable_rich_results_validation' AND is_unknown = false), enable_rich_results_validation), enable_axe = COALESCE((SELECT value FROM pipeline_config WHERE key = 'enable_axe' AND is_unknown = false), enable_axe), enable_spell_check = COALESCE((SELECT value FROM pipeline_config WHERE key = 'enable_spell_check' AND is_unknown = false), enable_spell_check), enable_html_validation = COALESCE((SELECT value FROM pipeline_config WHERE key = 'enable_html_validation' AND is_unknown = false), enable_html_validation), enable_amp_audit = COALESCE((SELECT value FROM pipeline_config WHERE key = 'enable_amp_audit' AND is_unknown = false), enable_amp_audit), enable_wayback_lookup = COALESCE((SELECT value FROM pipeline_config WHERE key = 'enable_wayback_lookup' AND is_unknown = false), enable_wayback_lookup), lighthouse_max_pages = COALESCE((SELECT value FROM pipeline_config WHERE key = 'lighthouse_max_pages' AND is_unknown = false), lighthouse_max_pages), lighthouse_concurrency = COALESCE((SELECT value FROM pipeline_config WHERE key = 'lighthouse_concurrency' AND is_unknown = false), lighthouse_concurrency) WHERE id = 1;

UPDATE content_analysis_settings SET enable_duplicate_detection = COALESCE((SELECT value FROM pipeline_config WHERE key = 'enable_duplicate_detection' AND is_unknown = false), enable_duplicate_detection), enable_language_detection = COALESCE((SELECT value FROM pipeline_config WHERE key = 'enable_language_detection' AND is_unknown = false), enable_language_detection), analysis_fuzzy_threshold = COALESCE((SELECT value FROM pipeline_config WHERE key = 'analysis_fuzzy_threshold' AND is_unknown = false), analysis_fuzzy_threshold), analysis_simhash_hamming = COALESCE((SELECT value FROM pipeline_config WHERE key = 'analysis_simhash_hamming' AND is_unknown = false), analysis_simhash_hamming), analysis_simhash_max_urls = COALESCE((SELECT value FROM pipeline_config WHERE key = 'analysis_simhash_max_urls' AND is_unknown = false), analysis_simhash_max_urls), analysis_fuzzy_max_urls = COALESCE((SELECT value FROM pipeline_config WHERE key = 'analysis_fuzzy_max_urls' AND is_unknown = false), analysis_fuzzy_max_urls), analysis_dup_max_pages = COALESCE((SELECT value FROM pipeline_config WHERE key = 'analysis_dup_max_pages' AND is_unknown = false), analysis_dup_max_pages) WHERE id = 1;

UPDATE audit_step_settings SET run_crawl = COALESCE((SELECT value FROM pipeline_config WHERE key = 'run_crawl' AND is_unknown = false), run_crawl), run_report = COALESCE((SELECT value FROM pipeline_config WHERE key = 'run_report' AND is_unknown = false), run_report), run_plot = COALESCE((SELECT value FROM pipeline_config WHERE key = 'run_plot' AND is_unknown = false), run_plot) WHERE id = 1;

UPDATE google_pipeline_settings SET enable_google_search_console = COALESCE((SELECT value FROM pipeline_config WHERE key = 'enable_google_search_console' AND is_unknown = false), enable_google_search_console), enable_google_analytics = COALESCE((SELECT value FROM pipeline_config WHERE key = 'enable_google_analytics' AND is_unknown = false), enable_google_analytics), google_date_range_days = COALESCE((SELECT value FROM pipeline_config WHERE key = 'google_date_range_days' AND is_unknown = false), google_date_range_days), google_url_gap_list_limit = COALESCE((SELECT value FROM pipeline_config WHERE key = 'google_url_gap_list_limit' AND is_unknown = false), google_url_gap_list_limit), enrich_keywords_after_report = COALESCE((SELECT value FROM pipeline_config WHERE key = 'enrich_keywords_after_report' AND is_unknown = false), enrich_keywords_after_report), enable_google_keyword_planner = COALESCE((SELECT value FROM pipeline_config WHERE key = 'enable_google_keyword_planner' AND is_unknown = false), enable_google_keyword_planner), enable_keyword_forecast = COALESCE((SELECT value FROM pipeline_config WHERE key = 'enable_keyword_forecast' AND is_unknown = false), enable_keyword_forecast), google_ads_language_id = COALESCE((SELECT value FROM pipeline_config WHERE key = 'google_ads_language_id' AND is_unknown = false), google_ads_language_id), google_ads_geo_ids = COALESCE((SELECT value FROM pipeline_config WHERE key = 'google_ads_geo_ids' AND is_unknown = false), google_ads_geo_ids) WHERE id = 1;

UPDATE keyword_settings SET keyword_max_pages = COALESCE((SELECT value FROM pipeline_config WHERE key = 'keyword_max_pages' AND is_unknown = false), keyword_max_pages), keyword_gsc_max_rows = COALESCE((SELECT value FROM pipeline_config WHERE key = 'keyword_gsc_max_rows' AND is_unknown = false), keyword_gsc_max_rows), brand_name = COALESCE((SELECT value FROM pipeline_config WHERE key = 'brand_name' AND is_unknown = false), brand_name), keyword_seeds = COALESCE((SELECT value FROM pipeline_config WHERE key = 'keyword_seeds' AND is_unknown = false), keyword_seeds), enable_google_suggest = COALESCE((SELECT value FROM pipeline_config WHERE key = 'enable_google_suggest' AND is_unknown = false), enable_google_suggest), enable_google_trends = COALESCE((SELECT value FROM pipeline_config WHERE key = 'enable_google_trends' AND is_unknown = false), enable_google_trends), enable_wikipedia_topic = COALESCE((SELECT value FROM pipeline_config WHERE key = 'enable_wikipedia_topic' AND is_unknown = false), enable_wikipedia_topic), enable_datamuse = COALESCE((SELECT value FROM pipeline_config WHERE key = 'enable_datamuse' AND is_unknown = false), enable_datamuse), keyword_suggest_top_n = COALESCE((SELECT value FROM pipeline_config WHERE key = 'keyword_suggest_top_n' AND is_unknown = false), keyword_suggest_top_n), keyword_max_suggest_results = COALESCE((SELECT value FROM pipeline_config WHERE key = 'keyword_max_suggest_results' AND is_unknown = false), keyword_max_suggest_results) WHERE id = 1;
    """)


def downgrade() -> None:
    op.execute("""
        DROP TABLE IF EXISTS keyword_settings CASCADE;
        DROP TABLE IF EXISTS google_pipeline_settings CASCADE;
        DROP TABLE IF EXISTS audit_step_settings CASCADE;
        DROP TABLE IF EXISTS content_analysis_settings CASCADE;
        DROP TABLE IF EXISTS lighthouse_settings CASCADE;
        DROP TABLE IF EXISTS report_settings CASCADE;
        DROP TABLE IF EXISTS crawl_settings CASCADE;
        DROP TABLE IF EXISTS ui_preferences CASCADE;
        DROP TABLE IF EXISTS workspace_settings CASCADE;
        DROP TABLE IF EXISTS feature_flags CASCADE;
        DROP TABLE IF EXISTS mcp_settings CASCADE;
        DROP TABLE IF EXISTS integration_secrets CASCADE;
        DROP TABLE IF EXISTS llm_provider_profiles CASCADE;
        DROP TABLE IF EXISTS llm_settings CASCADE;
    """)
