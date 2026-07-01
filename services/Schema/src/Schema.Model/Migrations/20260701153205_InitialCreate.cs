using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Schema.Model.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "audit_step_settings",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, defaultValue: 1L),
                    run_crawl = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    run_report = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    run_plot = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("audit_step_settings_pkey", x => x.id);
                    table.CheckConstraint("audit_step_settings_id_check", "id = 1");
                });

            migrationBuilder.Sql("INSERT INTO audit_step_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;");

            migrationBuilder.CreateTable(
                name: "client_preferences",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, defaultValue: 1L),
                    default_landing_view = table.Column<string>(type: "text", nullable: false, defaultValueSql: "'overview'::text"),
                    chat_fab_corner = table.Column<string>(type: "text", nullable: false, defaultValueSql: "'bottom-right'::text"),
                    sidebar_collapsed = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    network_view_mode = table.Column<string>(type: "text", nullable: false, defaultValueSql: "'2d'::text"),
                    content_studio_ai_enabled = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    pipeline_python_exe = table.Column<string>(type: "text", nullable: false, defaultValueSql: "'python3'::text"),
                    pipeline_repo_root = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    radius_scale = table.Column<string>(type: "text", nullable: false, defaultValueSql: "'default'::text"),
                    density_scale = table.Column<string>(type: "text", nullable: false, defaultValueSql: "'default'::text"),
                    animations_enabled = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    font_size_scale = table.Column<string>(type: "text", nullable: false, defaultValueSql: "'default'::text"),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("client_preferences_pkey", x => x.id);
                    table.CheckConstraint("client_preferences_id_check", "id = 1");
                });

            migrationBuilder.Sql("INSERT INTO client_preferences (id) VALUES (1) ON CONFLICT (id) DO NOTHING;");

            migrationBuilder.CreateTable(
                name: "content_analysis_settings",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, defaultValue: 1L),
                    enable_duplicate_detection = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    enable_language_detection = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    analysis_fuzzy_threshold = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    analysis_simhash_hamming = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    analysis_simhash_max_urls = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    analysis_fuzzy_max_urls = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    analysis_dup_max_pages = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("content_analysis_settings_pkey", x => x.id);
                    table.CheckConstraint("content_analysis_settings_id_check", "id = 1");
                });

            migrationBuilder.Sql("INSERT INTO content_analysis_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;");

            migrationBuilder.CreateTable(
                name: "crawl_settings",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, defaultValue: 1L),
                    start_url = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    crawl_discovery_mode = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    crawl_url_list = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    crawl_user_agent_preset = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    crawl_user_agent_custom = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    compare_mobile_desktop = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    crawl_auth_username = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    crawl_extra_headers = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    crawl_robots_txt_override = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    custom_extractors = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    max_pages = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    concurrency = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    timeout = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    max_depth = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    polite_delay = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    ignore_robots = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    allow_external = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    store_outlinks = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    store_content_excerpt = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    content_excerpt_max_chars = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    store_page_html = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    max_stored_html_bytes = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    run_content_analysis = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    content_analysis_strategy = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    content_analysis_workers = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    custom_extraction_regex = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    crawl_path_segments = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    crawl_ignore_params = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    competitor_domains = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    export_logo_url = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    preserve_crawl_history = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    crawl_stream_to_db = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    crawl_exclude_urls = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    crawl_render_mode = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    crawl_js_concurrency = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    crawl_js_timeout = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    crawl_js_wait_until = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    crawl_js_extra_wait_ms = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    crawl_js_block_resources = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    crawl_js_capture_console = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    crawl_js_console_levels = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    crawl_js_capture_failed_requests = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    crawl_js_console_max_per_page = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("crawl_settings_pkey", x => x.id);
                    table.CheckConstraint("crawl_settings_id_check", "id = 1");
                });

            migrationBuilder.Sql("INSERT INTO crawl_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;");

            migrationBuilder.CreateTable(
                name: "feature_flags",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, defaultValue: 1L),
                    pipeline_enabled = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    write_enabled = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    pages_md_enabled = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    chat_enabled = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    mcp_visible = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    secrets_visible = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("feature_flags_pkey", x => x.id);
                    table.CheckConstraint("feature_flags_id_check", "id = 1");
                });

            migrationBuilder.Sql("INSERT INTO feature_flags (id) VALUES (1) ON CONFLICT (id) DO NOTHING;");

            migrationBuilder.CreateTable(
                name: "google_app_settings",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, defaultValue: 1L),
                    client_id = table.Column<string>(type: "text", nullable: true),
                    client_secret = table.Column<string>(type: "text", nullable: true),
                    service_account_json = table.Column<string>(type: "jsonb", nullable: true),
                    default_date_range_days = table.Column<int>(type: "integer", nullable: false, defaultValue: 28),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    developer_token = table.Column<string>(type: "text", nullable: true),
                    login_customer_id = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("google_app_settings_pkey", x => x.id);
                    table.CheckConstraint("google_app_settings_id_check", "id = 1");
                });

            migrationBuilder.Sql("INSERT INTO google_app_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;");

            migrationBuilder.CreateTable(
                name: "google_pipeline_settings",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, defaultValue: 1L),
                    enable_google_search_console = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    enable_google_analytics = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    google_date_range_days = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    google_url_gap_list_limit = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    enrich_keywords_after_report = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    enable_google_keyword_planner = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    enable_keyword_forecast = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    google_ads_language_id = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    google_ads_geo_ids = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("google_pipeline_settings_pkey", x => x.id);
                    table.CheckConstraint("google_pipeline_settings_id_check", "id = 1");
                });

            migrationBuilder.Sql("INSERT INTO google_pipeline_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;");

            migrationBuilder.CreateTable(
                name: "integration_secrets",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, defaultValue: 1L),
                    bing_webmaster_api_key = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    serp_api_key = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    google_rich_results_api_key = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    crawl_auth_password = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    crawl_cookies = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("integration_secrets_pkey", x => x.id);
                    table.CheckConstraint("integration_secrets_id_check", "id = 1");
                });

            migrationBuilder.Sql("INSERT INTO integration_secrets (id) VALUES (1) ON CONFLICT (id) DO NOTHING;");

            migrationBuilder.CreateTable(
                name: "keyword_settings",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, defaultValue: 1L),
                    keyword_max_pages = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    keyword_gsc_max_rows = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    brand_name = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    keyword_seeds = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    enable_google_suggest = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    enable_google_trends = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    enable_wikipedia_topic = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    enable_datamuse = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    keyword_suggest_top_n = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    keyword_max_suggest_results = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("keyword_settings_pkey", x => x.id);
                    table.CheckConstraint("keyword_settings_id_check", "id = 1");
                });

            migrationBuilder.Sql("INSERT INTO keyword_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;");

            migrationBuilder.CreateTable(
                name: "keyword_suggest_cache",
                columns: table => new
                {
                    cache_key = table.Column<string>(type: "text", nullable: false),
                    fetched_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    data = table.Column<string>(type: "jsonb", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("keyword_suggest_cache_pkey", x => x.cache_key);
                });

            migrationBuilder.CreateTable(
                name: "lighthouse_page_summaries",
                columns: table => new
                {
                    url = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    data = table.Column<string>(type: "jsonb", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("lighthouse_page_summaries_pkey", x => x.url);
                });

            migrationBuilder.CreateTable(
                name: "lighthouse_runs",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    url = table.Column<string>(type: "text", nullable: false),
                    strategy = table.Column<string>(type: "text", nullable: false),
                    run_index = table.Column<int>(type: "integer", nullable: false),
                    data = table.Column<string>(type: "jsonb", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("lighthouse_runs_pkey", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "lighthouse_settings",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, defaultValue: 1L),
                    lighthouse_url = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    lighthouse_mode = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    lighthouse_strategy = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    lighthouse_categories = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    lighthouse_iterations = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    run_lighthouse = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    run_lighthouse_on_pages = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    enable_crux = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    enable_rich_results_validation = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    enable_axe = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    enable_spell_check = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    enable_html_validation = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    enable_amp_audit = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    enable_wayback_lookup = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    lighthouse_max_pages = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    lighthouse_concurrency = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("lighthouse_settings_pkey", x => x.id);
                    table.CheckConstraint("lighthouse_settings_id_check", "id = 1");
                });

            migrationBuilder.Sql("INSERT INTO lighthouse_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;");

            migrationBuilder.CreateTable(
                name: "lighthouse_summary",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    data = table.Column<string>(type: "jsonb", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("lighthouse_summary_pkey", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "llm_cache",
                columns: table => new
                {
                    cache_key = table.Column<string>(type: "text", nullable: false),
                    response_json = table.Column<string>(type: "jsonb", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("llm_cache_pkey", x => x.cache_key);
                });

            migrationBuilder.CreateTable(
                name: "llm_provider_profiles",
                columns: table => new
                {
                    provider = table.Column<string>(type: "text", nullable: false),
                    api_key = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    saved_model = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    api_key_updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("llm_provider_profiles_pkey", x => x.provider);
                });

            migrationBuilder.CreateTable(
                name: "llm_settings",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, defaultValue: 1L),
                    enabled = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    provider = table.Column<string>(type: "text", nullable: false, defaultValueSql: "'none'::text"),
                    active_model = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    ollama_base_url = table.Column<string>(type: "text", nullable: false, defaultValueSql: "'http://127.0.0.1:11434'::text"),
                    enable_ner = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    enable_keyphrases = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    enable_similar_internal = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    enable_keyword_clusters = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    enable_issue_fixes = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    enable_audit_summary = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    enable_page_coach = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    enable_content_studio = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    enable_dashboards = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    chat_assistant_name = table.Column<string>(type: "text", nullable: false, defaultValueSql: "'AI Assistant'::text"),
                    chat_assistant_avatar_url = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    chat_unlimited_tool_rounds = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    chat_allow_crawl = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    chat_fast_narrative = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    max_pages = table.Column<int>(type: "integer", nullable: false, defaultValue: 60),
                    batch_size = table.Column<int>(type: "integer", nullable: false, defaultValue: 5),
                    concurrency = table.Column<int>(type: "integer", nullable: false, defaultValue: 2),
                    timeout_seconds = table.Column<int>(type: "integer", nullable: false, defaultValue: 120),
                    similar_top_k = table.Column<int>(type: "integer", nullable: false, defaultValue: 5),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("llm_settings_pkey", x => x.id);
                    table.CheckConstraint("llm_settings_id_check", "id = 1");
                });

            migrationBuilder.Sql("INSERT INTO llm_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;");

            migrationBuilder.CreateTable(
                name: "mcp_settings",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, defaultValue: 1L),
                    bearer_token = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    allowed_hosts = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    allowed_origins = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    public_url = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    tool_bundle = table.Column<string>(type: "text", nullable: false, defaultValueSql: "'core'::text"),
                    disabled_tools = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    enabled_domains = table.Column<string>(type: "text", nullable: false, defaultValueSql: "'[\"core\",\"insight\"]'::text"),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("mcp_settings_pkey", x => x.id);
                    table.CheckConstraint("mcp_settings_id_check", "id = 1");
                });

            migrationBuilder.Sql("INSERT INTO mcp_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;");

            migrationBuilder.CreateTable(
                name: "page_google_snapshots",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    page_url = table.Column<string>(type: "text", nullable: false),
                    url_norm = table.Column<string>(type: "text", nullable: false),
                    fetched_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    data = table.Column<string>(type: "jsonb", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("page_google_snapshots_pkey", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "properties",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    name = table.Column<string>(type: "text", nullable: false),
                    canonical_domain = table.Column<string>(type: "text", nullable: false),
                    site_url = table.Column<string>(type: "text", nullable: true),
                    gsc_site_url = table.Column<string>(type: "text", nullable: true),
                    ga4_property_id = table.Column<string>(type: "text", nullable: true),
                    default_crawl_preset = table.Column<string>(type: "text", nullable: true),
                    crawl_authorized_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    google_auth_mode = table.Column<string>(type: "text", nullable: true),
                    google_refresh_token = table.Column<string>(type: "text", nullable: true),
                    google_connected_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    google_connected_email = table.Column<string>(type: "text", nullable: true),
                    google_date_range_days = table.Column<int>(type: "integer", nullable: true),
                    schedule_cron = table.Column<string>(type: "text", nullable: true),
                    alert_webhook_url = table.Column<string>(type: "text", nullable: true),
                    alert_email = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("properties_pkey", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "report_payload",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    generated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    data = table.Column<string>(type: "jsonb", nullable: false),
                    site_name = table.Column<string>(type: "text", nullable: true),
                    canonical_domain = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("report_payload_pkey", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "report_settings",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, defaultValue: 1L),
                    outbound_domain_max_rows = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    include_keyword_opportunities = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    site_name = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    report_title = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    max_fetch_for_edges = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    same_domain_only = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    max_nodes_plot = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    run_security_scan = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    security_scan_active = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    security_max_urls_probe = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    probe_image_inventory = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    max_image_probe_urls = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    image_probe_concurrency = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    image_probe_timeout = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    image_unoptimized_min_kb = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    enable_subdomain_discovery = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    subdomain_ct_lookup = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    enable_rdap_org_lookup = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("report_settings_pkey", x => x.id);
                    table.CheckConstraint("report_settings_id_check", "id = 1");
                });

            migrationBuilder.Sql("INSERT INTO report_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;");

            migrationBuilder.CreateTable(
                name: "ui_preferences",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, defaultValue: 1L),
                    brand_name = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    brand_subtitle = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    brand_logo_url = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    custom_theme_json = table.Column<string>(type: "jsonb", nullable: true),
                    ui_prefs_json = table.Column<string>(type: "jsonb", nullable: true),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("ui_preferences_pkey", x => x.id);
                    table.CheckConstraint("ui_preferences_id_check", "id = 1");
                });

            migrationBuilder.Sql("INSERT INTO ui_preferences (id) VALUES (1) ON CONFLICT (id) DO NOTHING;");

            migrationBuilder.CreateTable(
                name: "workspace_settings",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false, defaultValue: 1L),
                    active_property_id = table.Column<int>(type: "integer", nullable: true),
                    warning_mapper_input = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    warning_mapper_input_type = table.Column<string>(type: "text", nullable: false, defaultValueSql: "'lighthouse'::text"),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("workspace_settings_pkey", x => x.id);
                    table.CheckConstraint("workspace_settings_id_check", "id = 1");
                });

            migrationBuilder.Sql("INSERT INTO workspace_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;");

            migrationBuilder.CreateTable(
                name: "lh_audits",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    run_id = table.Column<long>(type: "bigint", nullable: false),
                    audit_id = table.Column<string>(type: "text", nullable: false),
                    category_id = table.Column<string>(type: "text", nullable: true),
                    score = table.Column<double>(type: "double precision", nullable: true),
                    score_display_mode = table.Column<string>(type: "text", nullable: true),
                    title = table.Column<string>(type: "text", nullable: true),
                    description = table.Column<string>(type: "text", nullable: true),
                    display_value = table.Column<string>(type: "text", nullable: true),
                    numeric_value = table.Column<double>(type: "double precision", nullable: true),
                    help_text = table.Column<string>(type: "text", nullable: true),
                    details_type = table.Column<string>(type: "text", nullable: true),
                    details_headings = table.Column<string>(type: "jsonb", nullable: true),
                    details_meta = table.Column<string>(type: "jsonb", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("lh_audits_pkey", x => x.id);
                    table.ForeignKey(
                        name: "lh_audits_run_id_fkey",
                        column: x => x.run_id,
                        principalTable: "lighthouse_runs",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "audit_health_snapshots",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    property_id = table.Column<long>(type: "bigint", nullable: true),
                    report_id = table.Column<long>(type: "bigint", nullable: false),
                    canonical_domain = table.Column<string>(type: "text", nullable: true),
                    health_score = table.Column<int>(type: "integer", nullable: true),
                    category_scores = table.Column<string>(type: "jsonb", nullable: false, defaultValueSql: "'{}'::jsonb"),
                    issue_counts = table.Column<string>(type: "jsonb", nullable: false, defaultValueSql: "'{}'::jsonb"),
                    generated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("audit_health_snapshots_pkey", x => x.id);
                    table.ForeignKey(
                        name: "audit_health_snapshots_property_id_fkey",
                        column: x => x.property_id,
                        principalTable: "properties",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "audit_log",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    action = table.Column<string>(type: "text", nullable: false),
                    actor = table.Column<string>(type: "text", nullable: true),
                    property_id = table.Column<long>(type: "bigint", nullable: true),
                    detail = table.Column<string>(type: "jsonb", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("audit_log_pkey", x => x.id);
                    table.ForeignKey(
                        name: "audit_log_property_id_fkey",
                        column: x => x.property_id,
                        principalTable: "properties",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "chat_sessions",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    property_id = table.Column<long>(type: "bigint", nullable: false),
                    title = table.Column<string>(type: "text", nullable: false, defaultValueSql: "'New chat'::text"),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("chat_sessions_pkey", x => x.id);
                    table.ForeignKey(
                        name: "chat_sessions_property_id_fkey",
                        column: x => x.property_id,
                        principalTable: "properties",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "competitor_keyword_gap",
                columns: table => new
                {
                    property_id = table.Column<long>(type: "bigint", nullable: false),
                    data = table.Column<string>(type: "jsonb", nullable: false, defaultValueSql: "'[]'::jsonb"),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("competitor_keyword_gap_pkey", x => x.property_id);
                    table.ForeignKey(
                        name: "competitor_keyword_gap_property_id_fkey",
                        column: x => x.property_id,
                        principalTable: "properties",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "content_drafts",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    property_id = table.Column<long>(type: "bigint", nullable: false),
                    title = table.Column<string>(type: "text", nullable: false, defaultValueSql: "'Untitled draft'::text"),
                    target_keyword = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    landing_url = table.Column<string>(type: "text", nullable: true),
                    status = table.Column<string>(type: "text", nullable: false, defaultValueSql: "'draft'::text"),
                    body_html = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    title_tag = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    meta_description = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    grade_score = table.Column<short>(type: "smallint", nullable: true),
                    grade_snapshot = table.Column<string>(type: "jsonb", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("content_drafts_pkey", x => x.id);
                    table.CheckConstraint("content_drafts_status_check", "status IN ('draft', 'ready', 'archived')");
                    table.ForeignKey(
                        name: "content_drafts_property_id_fkey",
                        column: x => x.property_id,
                        principalTable: "properties",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "crawl_runs",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    start_url = table.Column<string>(type: "text", nullable: true),
                    property_id = table.Column<long>(type: "bigint", nullable: true),
                    render_mode = table.Column<string>(type: "text", nullable: true, defaultValueSql: "'static'::text"),
                    discovery_mode = table.Column<string>(type: "text", nullable: true, defaultValueSql: "'spider'::text"),
                    mobile_run_id = table.Column<long>(type: "bigint", nullable: true),
                    pause_state = table.Column<string>(type: "jsonb", nullable: true),
                    paused_at = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("crawl_runs_pkey", x => x.id);
                    table.ForeignKey(
                        name: "crawl_runs_mobile_run_id_fkey",
                        column: x => x.mobile_run_id,
                        principalTable: "crawl_runs",
                        principalColumn: "id");
                    table.ForeignKey(
                        name: "crawl_runs_property_id_fkey",
                        column: x => x.property_id,
                        principalTable: "properties",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "crux_snapshots",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    property_id = table.Column<long>(type: "bigint", nullable: true),
                    origin = table.Column<string>(type: "text", nullable: false),
                    url = table.Column<string>(type: "text", nullable: true),
                    metrics = table.Column<string>(type: "jsonb", nullable: false, defaultValueSql: "'{}'::jsonb"),
                    fetched_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("crux_snapshots_pkey", x => x.id);
                    table.ForeignKey(
                        name: "crux_snapshots_property_id_fkey",
                        column: x => x.property_id,
                        principalTable: "properties",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "dashboards",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    property_id = table.Column<long>(type: "bigint", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false, defaultValueSql: "'Untitled dashboard'::text"),
                    layout_json = table.Column<string>(type: "jsonb", nullable: false, defaultValueSql: "'{}'::jsonb"),
                    is_default = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("dashboards_pkey", x => x.id);
                    table.ForeignKey(
                        name: "dashboards_property_id_fkey",
                        column: x => x.property_id,
                        principalTable: "properties",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "export_jobs",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    report_id = table.Column<long>(type: "bigint", nullable: false),
                    format = table.Column<string>(type: "text", nullable: false),
                    status = table.Column<string>(type: "text", nullable: false, defaultValueSql: "'pending'::text"),
                    file_path = table.Column<string>(type: "text", nullable: true),
                    error_text = table.Column<string>(type: "text", nullable: true),
                    property_id = table.Column<long>(type: "bigint", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    finished_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("export_jobs_pkey", x => x.id);
                    table.ForeignKey(
                        name: "export_jobs_property_id_fkey",
                        column: x => x.property_id,
                        principalTable: "properties",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "google_data",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    fetched_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    data = table.Column<string>(type: "jsonb", nullable: false),
                    property_id = table.Column<long>(type: "bigint", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("google_data_pkey", x => x.id);
                    table.ForeignKey(
                        name: "google_data_property_id_fkey",
                        column: x => x.property_id,
                        principalTable: "properties",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "gsc_links_data",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    fetched_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    property_id = table.Column<long>(type: "bigint", nullable: false),
                    data = table.Column<string>(type: "jsonb", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("gsc_links_data_pkey", x => x.id);
                    table.ForeignKey(
                        name: "gsc_links_data_property_id_fkey",
                        column: x => x.property_id,
                        principalTable: "properties",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "gsc_links_snapshots",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    property_id = table.Column<long>(type: "bigint", nullable: false),
                    fetched_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    referring_domains = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    top_domains = table.Column<string>(type: "jsonb", nullable: false, defaultValueSql: "'[]'::jsonb")
                },
                constraints: table =>
                {
                    table.PrimaryKey("gsc_links_snapshots_pkey", x => x.id);
                    table.ForeignKey(
                        name: "gsc_links_snapshots_property_id_fkey",
                        column: x => x.property_id,
                        principalTable: "properties",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "issue_status",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    property_id = table.Column<long>(type: "bigint", nullable: false),
                    report_id = table.Column<long>(type: "bigint", nullable: true),
                    issue_fingerprint = table.Column<string>(type: "text", nullable: false),
                    category_id = table.Column<string>(type: "text", nullable: true),
                    message = table.Column<string>(type: "text", nullable: false),
                    url = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    priority = table.Column<string>(type: "text", nullable: false, defaultValueSql: "'Medium'::text"),
                    status = table.Column<string>(type: "text", nullable: false, defaultValueSql: "'open'::text"),
                    assignee = table.Column<string>(type: "text", nullable: true),
                    note = table.Column<string>(type: "text", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("issue_status_pkey", x => x.id);
                    table.ForeignKey(
                        name: "issue_status_property_id_fkey",
                        column: x => x.property_id,
                        principalTable: "properties",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "keyword_data",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    fetched_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    data = table.Column<string>(type: "jsonb", nullable: false),
                    property_id = table.Column<long>(type: "bigint", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("keyword_data_pkey", x => x.id);
                    table.ForeignKey(
                        name: "keyword_data_property_id_fkey",
                        column: x => x.property_id,
                        principalTable: "properties",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "keyword_history",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    keyword = table.Column<string>(type: "text", nullable: false),
                    fetched_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    position = table.Column<double>(type: "double precision", nullable: true),
                    clicks = table.Column<int>(type: "integer", nullable: true),
                    impressions = table.Column<int>(type: "integer", nullable: true),
                    ctr = table.Column<double>(type: "double precision", nullable: true),
                    property_id = table.Column<long>(type: "bigint", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("keyword_history_pkey", x => x.id);
                    table.ForeignKey(
                        name: "keyword_history_property_id_fkey",
                        column: x => x.property_id,
                        principalTable: "properties",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "log_file_uploads",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    property_id = table.Column<long>(type: "bigint", nullable: false),
                    filename = table.Column<string>(type: "text", nullable: false),
                    line_count = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    uploaded_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    analysis = table.Column<string>(type: "jsonb", nullable: false, defaultValueSql: "'{}'::jsonb")
                },
                constraints: table =>
                {
                    table.PrimaryKey("log_file_uploads_pkey", x => x.id);
                    table.ForeignKey(
                        name: "log_file_uploads_property_id_fkey",
                        column: x => x.property_id,
                        principalTable: "properties",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "pipeline_jobs",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    job_type = table.Column<string>(type: "text", nullable: false, defaultValueSql: "'pipeline'::text"),
                    status = table.Column<string>(type: "text", nullable: false, defaultValueSql: "'running'::text"),
                    exit_code = table.Column<int>(type: "integer", nullable: true),
                    log_text = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    error_text = table.Column<string>(type: "text", nullable: true),
                    property_id = table.Column<long>(type: "bigint", nullable: true),
                    config_hash = table.Column<string>(type: "text", nullable: true),
                    started_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    finished_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    log_truncated = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    command = table.Column<string>(type: "text", nullable: true),
                    cancel_requested = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    pause_requested = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    worker_pid = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pipeline_jobs_pkey", x => x.id);
                    table.ForeignKey(
                        name: "pipeline_jobs_property_id_fkey",
                        column: x => x.property_id,
                        principalTable: "properties",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "saved_crawl_filters",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    property_id = table.Column<long>(type: "bigint", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    filter_json = table.Column<string>(type: "jsonb", nullable: false, defaultValueSql: "'{}'::jsonb"),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("saved_crawl_filters_pkey", x => x.id);
                    table.ForeignKey(
                        name: "saved_crawl_filters_property_id_fkey",
                        column: x => x.property_id,
                        principalTable: "properties",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "lh_audit_items",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    audit_row_id = table.Column<long>(type: "bigint", nullable: false),
                    item_index = table.Column<int>(type: "integer", nullable: false),
                    row_data = table.Column<string>(type: "jsonb", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("lh_audit_items_pkey", x => x.id);
                    table.ForeignKey(
                        name: "lh_audit_items_audit_row_id_fkey",
                        column: x => x.audit_row_id,
                        principalTable: "lh_audits",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "chat_messages",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    session_id = table.Column<long>(type: "bigint", nullable: false),
                    role = table.Column<string>(type: "text", nullable: false),
                    content = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    tool_name = table.Column<string>(type: "text", nullable: true),
                    tool_args = table.Column<string>(type: "jsonb", nullable: true),
                    tool_result = table.Column<string>(type: "jsonb", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("chat_messages_pkey", x => x.id);
                    table.CheckConstraint("chat_messages_role_check", "role IN ('user', 'assistant', 'tool')");
                    table.ForeignKey(
                        name: "chat_messages_session_id_fkey",
                        column: x => x.session_id,
                        principalTable: "chat_sessions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "crawl_page_html",
                columns: table => new
                {
                    crawl_run_id = table.Column<long>(type: "bigint", nullable: false),
                    url = table.Column<string>(type: "text", nullable: false),
                    html = table.Column<string>(type: "text", nullable: false),
                    status = table.Column<string>(type: "text", nullable: true),
                    content_type = table.Column<string>(type: "text", nullable: true),
                    fetch_method = table.Column<string>(type: "text", nullable: false, defaultValueSql: "'static'::text"),
                    byte_length = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    captured_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("crawl_page_html_pkey", x => new { x.crawl_run_id, x.url });
                    table.ForeignKey(
                        name: "crawl_page_html_crawl_run_id_fkey",
                        column: x => x.crawl_run_id,
                        principalTable: "crawl_runs",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "crawl_page_markdown",
                columns: table => new
                {
                    crawl_run_id = table.Column<long>(type: "bigint", nullable: false),
                    url = table.Column<string>(type: "text", nullable: false),
                    property_id = table.Column<long>(type: "bigint", nullable: true),
                    title = table.Column<string>(type: "text", nullable: true),
                    markdown = table.Column<string>(type: "text", nullable: false),
                    word_count = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    strategy = table.Column<string>(type: "text", nullable: false, defaultValueSql: "'main_only'::text"),
                    source_byte_length = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    extracted_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("crawl_page_markdown_pkey", x => new { x.crawl_run_id, x.url });
                    table.ForeignKey(
                        name: "crawl_page_markdown_crawl_run_id_fkey",
                        column: x => x.crawl_run_id,
                        principalTable: "crawl_runs",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "crawl_page_markdown_property_id_fkey",
                        column: x => x.property_id,
                        principalTable: "properties",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "crawl_results",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    crawl_run_id = table.Column<long>(type: "bigint", nullable: false),
                    url = table.Column<string>(type: "text", nullable: false),
                    data = table.Column<string>(type: "jsonb", nullable: false),
                    status = table.Column<string>(type: "text", nullable: true),
                    title = table.Column<string>(type: "text", nullable: true),
                    fetch_method = table.Column<string>(type: "text", nullable: true, defaultValueSql: "'static'::text")
                },
                constraints: table =>
                {
                    table.PrimaryKey("crawl_results_pkey", x => x.id);
                    table.ForeignKey(
                        name: "crawl_results_crawl_run_id_fkey",
                        column: x => x.crawl_run_id,
                        principalTable: "crawl_runs",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "edges",
                columns: table => new
                {
                    crawl_run_id = table.Column<long>(type: "bigint", nullable: false),
                    from_url = table.Column<string>(type: "text", nullable: false),
                    to_url = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("edges_pkey", x => new { x.crawl_run_id, x.from_url, x.to_url });
                    table.ForeignKey(
                        name: "edges_crawl_run_id_fkey",
                        column: x => x.crawl_run_id,
                        principalTable: "crawl_runs",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "link_edges",
                columns: table => new
                {
                    crawl_run_id = table.Column<long>(type: "bigint", nullable: false),
                    from_url = table.Column<string>(type: "text", nullable: false),
                    to_url = table.Column<string>(type: "text", nullable: false),
                    anchor_text = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    rel = table.Column<string>(type: "text", nullable: false, defaultValueSql: "''::text"),
                    is_nofollow = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    is_sponsored = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    is_ugc = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    link_type = table.Column<string>(type: "text", nullable: false, defaultValueSql: "'internal'::text"),
                    position = table.Column<string>(type: "text", nullable: false, defaultValueSql: "'content'::text")
                },
                constraints: table =>
                {
                    table.PrimaryKey("link_edges_pkey", x => new { x.crawl_run_id, x.from_url, x.to_url, x.anchor_text, x.rel });
                    table.ForeignKey(
                        name: "link_edges_crawl_run_id_fkey",
                        column: x => x.crawl_run_id,
                        principalTable: "crawl_runs",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "nodes",
                columns: table => new
                {
                    crawl_run_id = table.Column<long>(type: "bigint", nullable: false),
                    url = table.Column<string>(type: "text", nullable: false),
                    count = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("nodes_pkey", x => new { x.crawl_run_id, x.url });
                    table.ForeignKey(
                        name: "nodes_crawl_run_id_fkey",
                        column: x => x.crawl_run_id,
                        principalTable: "crawl_runs",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "idx_audit_health_property",
                table: "audit_health_snapshots",
                columns: new[] { "property_id", "generated_at" },
                descending: new[] { false, true });

            migrationBuilder.CreateIndex(
                name: "idx_audit_health_report",
                table: "audit_health_snapshots",
                column: "report_id");

            migrationBuilder.CreateIndex(
                name: "idx_audit_log_created",
                table: "audit_log",
                column: "created_at",
                descending: new bool[0]);

            migrationBuilder.CreateIndex(
                name: "IX_audit_log_property_id",
                table: "audit_log",
                column: "property_id");

            migrationBuilder.CreateIndex(
                name: "chat_messages_session_created_idx",
                table: "chat_messages",
                columns: new[] { "session_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "chat_sessions_property_updated_idx",
                table: "chat_sessions",
                columns: new[] { "property_id", "updated_at" },
                descending: new[] { false, true });

            migrationBuilder.CreateIndex(
                name: "content_drafts_property_updated_idx",
                table: "content_drafts",
                columns: new[] { "property_id", "updated_at" },
                descending: new[] { false, true });

            migrationBuilder.CreateIndex(
                name: "idx_crawl_page_html_run",
                table: "crawl_page_html",
                column: "crawl_run_id");

            migrationBuilder.CreateIndex(
                name: "idx_crawl_page_markdown_property",
                table: "crawl_page_markdown",
                column: "property_id");

            migrationBuilder.CreateIndex(
                name: "idx_crawl_page_markdown_run",
                table: "crawl_page_markdown",
                column: "crawl_run_id");

            migrationBuilder.CreateIndex(
                name: "crawl_results_crawl_run_id_url_key",
                table: "crawl_results",
                columns: new[] { "crawl_run_id", "url" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "idx_crawl_results_run",
                table: "crawl_results",
                column: "crawl_run_id");

            migrationBuilder.CreateIndex(
                name: "idx_crawl_results_run_fetch_method",
                table: "crawl_results",
                columns: new[] { "crawl_run_id", "fetch_method" });

            migrationBuilder.CreateIndex(
                name: "idx_crawl_results_run_status",
                table: "crawl_results",
                columns: new[] { "crawl_run_id", "status" });

            migrationBuilder.CreateIndex(
                name: "idx_crawl_runs_property",
                table: "crawl_runs",
                column: "property_id");

            migrationBuilder.CreateIndex(
                name: "IX_crawl_runs_mobile_run_id",
                table: "crawl_runs",
                column: "mobile_run_id");

            migrationBuilder.CreateIndex(
                name: "idx_crux_snapshots_origin",
                table: "crux_snapshots",
                columns: new[] { "origin", "fetched_at" },
                descending: new[] { false, true });

            migrationBuilder.CreateIndex(
                name: "IX_crux_snapshots_property_id",
                table: "crux_snapshots",
                column: "property_id");

            migrationBuilder.CreateIndex(
                name: "dashboards_property_updated_idx",
                table: "dashboards",
                columns: new[] { "property_id", "updated_at" },
                descending: new[] { false, true });

            migrationBuilder.CreateIndex(
                name: "IX_export_jobs_property_id",
                table: "export_jobs",
                column: "property_id");

            migrationBuilder.CreateIndex(
                name: "idx_google_data_property_fetched",
                table: "google_data",
                columns: new[] { "property_id", "fetched_at" },
                descending: new[] { false, true });

            migrationBuilder.CreateIndex(
                name: "idx_gsc_links_data_property_fetched",
                table: "gsc_links_data",
                columns: new[] { "property_id", "fetched_at" },
                descending: new[] { false, true });

            migrationBuilder.CreateIndex(
                name: "idx_gsc_links_snapshots_property",
                table: "gsc_links_snapshots",
                columns: new[] { "property_id", "fetched_at" },
                descending: new[] { false, true });

            migrationBuilder.CreateIndex(
                name: "idx_issue_status_property",
                table: "issue_status",
                columns: new[] { "property_id", "status" });

            migrationBuilder.CreateIndex(
                name: "idx_issue_status_report",
                table: "issue_status",
                column: "report_id");

            migrationBuilder.CreateIndex(
                name: "issue_status_property_id_issue_fingerprint_key",
                table: "issue_status",
                columns: new[] { "property_id", "issue_fingerprint" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "idx_keyword_data_property_fetched",
                table: "keyword_data",
                columns: new[] { "property_id", "fetched_at" },
                descending: new[] { false, true });

            migrationBuilder.CreateIndex(
                name: "idx_keyword_history_property_kw",
                table: "keyword_history",
                columns: new[] { "property_id", "keyword", "fetched_at" },
                descending: new[] { false, false, true });

            migrationBuilder.CreateIndex(
                name: "idx_kw_history_keyword_id",
                table: "keyword_history",
                columns: new[] { "keyword", "id" },
                descending: new[] { false, true });

            migrationBuilder.CreateIndex(
                name: "idx_lh_audit_items_audit_row",
                table: "lh_audit_items",
                column: "audit_row_id");

            migrationBuilder.CreateIndex(
                name: "idx_lh_audits_audit_id",
                table: "lh_audits",
                column: "audit_id");

            migrationBuilder.CreateIndex(
                name: "idx_lh_audits_run_audit",
                table: "lh_audits",
                columns: new[] { "run_id", "audit_id" });

            migrationBuilder.CreateIndex(
                name: "idx_lh_audits_run_id",
                table: "lh_audits",
                column: "run_id");

            migrationBuilder.CreateIndex(
                name: "idx_link_edges_run_from",
                table: "link_edges",
                columns: new[] { "crawl_run_id", "from_url" });

            migrationBuilder.CreateIndex(
                name: "idx_link_edges_run_to",
                table: "link_edges",
                columns: new[] { "crawl_run_id", "to_url" });

            migrationBuilder.CreateIndex(
                name: "idx_log_uploads_property",
                table: "log_file_uploads",
                columns: new[] { "property_id", "uploaded_at" },
                descending: new[] { false, true });

            migrationBuilder.CreateIndex(
                name: "ix_page_google_snapshots_url_norm_fetched",
                table: "page_google_snapshots",
                columns: new[] { "url_norm", "fetched_at" },
                descending: new[] { false, true });

            migrationBuilder.CreateIndex(
                name: "idx_pipeline_jobs_started",
                table: "pipeline_jobs",
                column: "started_at",
                descending: new bool[0]);

            migrationBuilder.CreateIndex(
                name: "IX_pipeline_jobs_property_id",
                table: "pipeline_jobs",
                column: "property_id");

            migrationBuilder.CreateIndex(
                name: "idx_properties_domain",
                table: "properties",
                column: "canonical_domain");

            migrationBuilder.CreateIndex(
                name: "properties_canonical_domain_key",
                table: "properties",
                column: "canonical_domain",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "idx_report_payload_canonical_domain",
                table: "report_payload",
                column: "canonical_domain");

            migrationBuilder.CreateIndex(
                name: "idx_report_payload_generated_at",
                table: "report_payload",
                column: "generated_at",
                descending: new bool[0]);

            migrationBuilder.CreateIndex(
                name: "idx_saved_crawl_filters_property",
                table: "saved_crawl_filters",
                column: "property_id");

            migrationBuilder.CreateIndex(
                name: "saved_crawl_filters_property_id_name_key",
                table: "saved_crawl_filters",
                columns: new[] { "property_id", "name" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "audit_health_snapshots");

            migrationBuilder.DropTable(
                name: "audit_log");

            migrationBuilder.DropTable(
                name: "audit_step_settings");

            migrationBuilder.DropTable(
                name: "chat_messages");

            migrationBuilder.DropTable(
                name: "client_preferences");

            migrationBuilder.DropTable(
                name: "competitor_keyword_gap");

            migrationBuilder.DropTable(
                name: "content_analysis_settings");

            migrationBuilder.DropTable(
                name: "content_drafts");

            migrationBuilder.DropTable(
                name: "crawl_page_html");

            migrationBuilder.DropTable(
                name: "crawl_page_markdown");

            migrationBuilder.DropTable(
                name: "crawl_results");

            migrationBuilder.DropTable(
                name: "crawl_settings");

            migrationBuilder.DropTable(
                name: "crux_snapshots");

            migrationBuilder.DropTable(
                name: "dashboards");

            migrationBuilder.DropTable(
                name: "edges");

            migrationBuilder.DropTable(
                name: "export_jobs");

            migrationBuilder.DropTable(
                name: "feature_flags");

            migrationBuilder.DropTable(
                name: "google_app_settings");

            migrationBuilder.DropTable(
                name: "google_data");

            migrationBuilder.DropTable(
                name: "google_pipeline_settings");

            migrationBuilder.DropTable(
                name: "gsc_links_data");

            migrationBuilder.DropTable(
                name: "gsc_links_snapshots");

            migrationBuilder.DropTable(
                name: "integration_secrets");

            migrationBuilder.DropTable(
                name: "issue_status");

            migrationBuilder.DropTable(
                name: "keyword_data");

            migrationBuilder.DropTable(
                name: "keyword_history");

            migrationBuilder.DropTable(
                name: "keyword_settings");

            migrationBuilder.DropTable(
                name: "keyword_suggest_cache");

            migrationBuilder.DropTable(
                name: "lh_audit_items");

            migrationBuilder.DropTable(
                name: "lighthouse_page_summaries");

            migrationBuilder.DropTable(
                name: "lighthouse_settings");

            migrationBuilder.DropTable(
                name: "lighthouse_summary");

            migrationBuilder.DropTable(
                name: "link_edges");

            migrationBuilder.DropTable(
                name: "llm_cache");

            migrationBuilder.DropTable(
                name: "llm_provider_profiles");

            migrationBuilder.DropTable(
                name: "llm_settings");

            migrationBuilder.DropTable(
                name: "log_file_uploads");

            migrationBuilder.DropTable(
                name: "mcp_settings");

            migrationBuilder.DropTable(
                name: "nodes");

            migrationBuilder.DropTable(
                name: "page_google_snapshots");

            migrationBuilder.DropTable(
                name: "pipeline_jobs");

            migrationBuilder.DropTable(
                name: "report_payload");

            migrationBuilder.DropTable(
                name: "report_settings");

            migrationBuilder.DropTable(
                name: "saved_crawl_filters");

            migrationBuilder.DropTable(
                name: "ui_preferences");

            migrationBuilder.DropTable(
                name: "workspace_settings");

            migrationBuilder.DropTable(
                name: "chat_sessions");

            migrationBuilder.DropTable(
                name: "lh_audits");

            migrationBuilder.DropTable(
                name: "crawl_runs");

            migrationBuilder.DropTable(
                name: "lighthouse_runs");

            migrationBuilder.DropTable(
                name: "properties");
        }
    }
}
