using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore;
using Schema.Model.Entities;

namespace Schema.Model.Persistence;

public partial class SchemaDbContext : DbContext
{
    public SchemaDbContext(DbContextOptions<SchemaDbContext> options)
        : base(options)
    {
    }

    public virtual DbSet<AuditHealthSnapshot> AuditHealthSnapshots { get; set; }

    public virtual DbSet<AuditLog> AuditLogs { get; set; }

    public virtual DbSet<AuditStepSetting> AuditStepSettings { get; set; }

    public virtual DbSet<ChatMessage> ChatMessages { get; set; }

    public virtual DbSet<ChatSession> ChatSessions { get; set; }

    public virtual DbSet<ClientPreference> ClientPreferences { get; set; }

    public virtual DbSet<CompetitorKeywordGap> CompetitorKeywordGaps { get; set; }

    public virtual DbSet<ContentAnalysisSetting> ContentAnalysisSettings { get; set; }

    public virtual DbSet<ContentDraft> ContentDrafts { get; set; }

    public virtual DbSet<CrawlPageHtml> CrawlPageHtmls { get; set; }

    public virtual DbSet<CrawlPageMarkdown> CrawlPageMarkdowns { get; set; }

    public virtual DbSet<CrawlResult> CrawlResults { get; set; }

    public virtual DbSet<CrawlRun> CrawlRuns { get; set; }

    public virtual DbSet<CrawlSetting> CrawlSettings { get; set; }

    public virtual DbSet<CruxSnapshot> CruxSnapshots { get; set; }

    public virtual DbSet<Dashboard> Dashboards { get; set; }

    public virtual DbSet<Edge> Edges { get; set; }

    public virtual DbSet<ExportJob> ExportJobs { get; set; }

    public virtual DbSet<FeatureFlag> FeatureFlags { get; set; }

    public virtual DbSet<GoogleAppSetting> GoogleAppSettings { get; set; }

    public virtual DbSet<GoogleDatum> GoogleData { get; set; }

    public virtual DbSet<GooglePipelineSetting> GooglePipelineSettings { get; set; }

    public virtual DbSet<GscLinksDatum> GscLinksData { get; set; }

    public virtual DbSet<GscLinksSnapshot> GscLinksSnapshots { get; set; }

    public virtual DbSet<IntegrationSecret> IntegrationSecrets { get; set; }

    public virtual DbSet<IssueStatus> IssueStatuses { get; set; }

    public virtual DbSet<KeywordDatum> KeywordData { get; set; }

    public virtual DbSet<KeywordHistory> KeywordHistories { get; set; }

    public virtual DbSet<KeywordSetting> KeywordSettings { get; set; }

    public virtual DbSet<KeywordSuggestCache> KeywordSuggestCaches { get; set; }

    public virtual DbSet<LhAudit> LhAudits { get; set; }

    public virtual DbSet<LhAuditItem> LhAuditItems { get; set; }

    public virtual DbSet<LighthousePageSummary> LighthousePageSummaries { get; set; }

    public virtual DbSet<LighthouseRun> LighthouseRuns { get; set; }

    public virtual DbSet<LighthouseSetting> LighthouseSettings { get; set; }

    public virtual DbSet<LighthouseSummary> LighthouseSummaries { get; set; }

    public virtual DbSet<LinkEdge> LinkEdges { get; set; }

    public virtual DbSet<LlmCache> LlmCaches { get; set; }

    public virtual DbSet<LlmProviderProfile> LlmProviderProfiles { get; set; }

    public virtual DbSet<LlmSetting> LlmSettings { get; set; }

    public virtual DbSet<LogFileUpload> LogFileUploads { get; set; }

    public virtual DbSet<McpSetting> McpSettings { get; set; }

    public virtual DbSet<Node> Nodes { get; set; }

    public virtual DbSet<PageGoogleSnapshot> PageGoogleSnapshots { get; set; }

    public virtual DbSet<PipelineJob> PipelineJobs { get; set; }

    public virtual DbSet<Property> Properties { get; set; }

    public virtual DbSet<ReportPayload> ReportPayloads { get; set; }

    public virtual DbSet<ReportSetting> ReportSettings { get; set; }

    public virtual DbSet<SavedCrawlFilter> SavedCrawlFilters { get; set; }

    public virtual DbSet<UiPreference> UiPreferences { get; set; }

    public virtual DbSet<WorkspaceSetting> WorkspaceSettings { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<AuditHealthSnapshot>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("audit_health_snapshots_pkey");

            entity.ToTable("audit_health_snapshots");

            entity.HasIndex(e => new { e.PropertyId, e.GeneratedAt }, "idx_audit_health_property").IsDescending(false, true);

            entity.HasIndex(e => e.ReportId, "idx_audit_health_report");

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.CanonicalDomain).HasColumnName("canonical_domain");
            entity.Property(e => e.CategoryScores)
                .HasDefaultValueSql("'{}'::jsonb")
                .HasColumnType("jsonb")
                .HasColumnName("category_scores");
            entity.Property(e => e.GeneratedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("generated_at");
            entity.Property(e => e.HealthScore).HasColumnName("health_score");
            entity.Property(e => e.IssueCounts)
                .HasDefaultValueSql("'{}'::jsonb")
                .HasColumnType("jsonb")
                .HasColumnName("issue_counts");
            entity.Property(e => e.PropertyId).HasColumnName("property_id");
            entity.Property(e => e.ReportId).HasColumnName("report_id");

            entity.HasOne<Property>().WithMany()
                .HasForeignKey(d => d.PropertyId)
                .OnDelete(DeleteBehavior.Cascade)
                .HasConstraintName("audit_health_snapshots_property_id_fkey");
        });

        modelBuilder.Entity<AuditLog>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("audit_log_pkey");

            entity.ToTable("audit_log");

            entity.HasIndex(e => e.CreatedAt, "idx_audit_log_created").IsDescending();

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.Action).HasColumnName("action");
            entity.Property(e => e.Actor).HasColumnName("actor");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.Detail)
                .HasColumnType("jsonb")
                .HasColumnName("detail");
            entity.Property(e => e.PropertyId).HasColumnName("property_id");

            entity.HasOne<Property>().WithMany()
                .HasForeignKey(d => d.PropertyId)
                .OnDelete(DeleteBehavior.SetNull)
                .HasConstraintName("audit_log_property_id_fkey");
        });

        modelBuilder.Entity<AuditStepSetting>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("audit_step_settings_pkey");

            entity.ToTable("audit_step_settings");

            entity.Property(e => e.Id)
                .HasDefaultValue(1L)
                .HasColumnName("id");
            entity.Property(e => e.RunCrawl)
                .HasDefaultValueSql("''::text")
                .HasColumnName("run_crawl");
            entity.Property(e => e.RunPlot)
                .HasDefaultValueSql("''::text")
                .HasColumnName("run_plot");
            entity.Property(e => e.RunReport)
                .HasDefaultValueSql("''::text")
                .HasColumnName("run_report");
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("updated_at");
        });

        modelBuilder.Entity<ChatMessage>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("chat_messages_pkey");

            entity.ToTable("chat_messages");

            entity.HasIndex(e => new { e.SessionId, e.CreatedAt }, "chat_messages_session_created_idx");

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.Content)
                .HasDefaultValueSql("''::text")
                .HasColumnName("content");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.Role).HasColumnName("role");
            entity.Property(e => e.SessionId).HasColumnName("session_id");
            entity.Property(e => e.ToolArgs)
                .HasColumnType("jsonb")
                .HasColumnName("tool_args");
            entity.Property(e => e.ToolName).HasColumnName("tool_name");
            entity.Property(e => e.ToolResult)
                .HasColumnType("jsonb")
                .HasColumnName("tool_result");

            entity.HasOne<ChatSession>().WithMany()
                .HasForeignKey(d => d.SessionId)
                .HasConstraintName("chat_messages_session_id_fkey");
        });

        modelBuilder.Entity<ChatSession>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("chat_sessions_pkey");

            entity.ToTable("chat_sessions");

            entity.HasIndex(e => new { e.PropertyId, e.UpdatedAt }, "chat_sessions_property_updated_idx").IsDescending(false, true);

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.PropertyId).HasColumnName("property_id");
            entity.Property(e => e.Title)
                .HasDefaultValueSql("'New chat'::text")
                .HasColumnName("title");
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("updated_at");

            entity.HasOne<Property>().WithMany()
                .HasForeignKey(d => d.PropertyId)
                .HasConstraintName("chat_sessions_property_id_fkey");
        });

        modelBuilder.Entity<ClientPreference>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("client_preferences_pkey");

            entity.ToTable("client_preferences");

            entity.Property(e => e.Id)
                .HasDefaultValue(1L)
                .HasColumnName("id");
            entity.Property(e => e.AnimationsEnabled)
                .HasDefaultValue(true)
                .HasColumnName("animations_enabled");
            entity.Property(e => e.ChatFabCorner)
                .HasDefaultValueSql("'bottom-right'::text")
                .HasColumnName("chat_fab_corner");
            entity.Property(e => e.ContentStudioAiEnabled)
                .HasDefaultValue(true)
                .HasColumnName("content_studio_ai_enabled");
            entity.Property(e => e.DefaultLandingView)
                .HasDefaultValueSql("'overview'::text")
                .HasColumnName("default_landing_view");
            entity.Property(e => e.DensityScale)
                .HasDefaultValueSql("'default'::text")
                .HasColumnName("density_scale");
            entity.Property(e => e.FontSizeScale)
                .HasDefaultValueSql("'default'::text")
                .HasColumnName("font_size_scale");
            entity.Property(e => e.NetworkViewMode)
                .HasDefaultValueSql("'2d'::text")
                .HasColumnName("network_view_mode");
            entity.Property(e => e.PipelinePythonExe)
                .HasDefaultValueSql("'python3'::text")
                .HasColumnName("pipeline_python_exe");
            entity.Property(e => e.PipelineRepoRoot)
                .HasDefaultValueSql("''::text")
                .HasColumnName("pipeline_repo_root");
            entity.Property(e => e.RadiusScale)
                .HasDefaultValueSql("'default'::text")
                .HasColumnName("radius_scale");
            entity.Property(e => e.SidebarCollapsed).HasColumnName("sidebar_collapsed");
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("updated_at");
        });

        modelBuilder.Entity<CompetitorKeywordGap>(entity =>
        {
            entity.HasKey(e => e.PropertyId).HasName("competitor_keyword_gap_pkey");

            entity.ToTable("competitor_keyword_gap");

            entity.Property(e => e.PropertyId)
                .ValueGeneratedNever()
                .HasColumnName("property_id");
            entity.Property(e => e.Data)
                .HasDefaultValueSql("'[]'::jsonb")
                .HasColumnType("jsonb")
                .HasColumnName("data");
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("updated_at");

            entity.HasOne<Property>().WithOne()
                .HasForeignKey<CompetitorKeywordGap>(d => d.PropertyId)
                .HasConstraintName("competitor_keyword_gap_property_id_fkey");
        });

        modelBuilder.Entity<ContentAnalysisSetting>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("content_analysis_settings_pkey");

            entity.ToTable("content_analysis_settings");

            entity.Property(e => e.Id)
                .HasDefaultValue(1L)
                .HasColumnName("id");
            entity.Property(e => e.AnalysisDupMaxPages)
                .HasDefaultValueSql("''::text")
                .HasColumnName("analysis_dup_max_pages");
            entity.Property(e => e.AnalysisFuzzyMaxUrls)
                .HasDefaultValueSql("''::text")
                .HasColumnName("analysis_fuzzy_max_urls");
            entity.Property(e => e.AnalysisFuzzyThreshold)
                .HasDefaultValueSql("''::text")
                .HasColumnName("analysis_fuzzy_threshold");
            entity.Property(e => e.AnalysisSimhashHamming)
                .HasDefaultValueSql("''::text")
                .HasColumnName("analysis_simhash_hamming");
            entity.Property(e => e.AnalysisSimhashMaxUrls)
                .HasDefaultValueSql("''::text")
                .HasColumnName("analysis_simhash_max_urls");
            entity.Property(e => e.EnableDuplicateDetection)
                .HasDefaultValueSql("''::text")
                .HasColumnName("enable_duplicate_detection");
            entity.Property(e => e.EnableLanguageDetection)
                .HasDefaultValueSql("''::text")
                .HasColumnName("enable_language_detection");
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("updated_at");
        });

        modelBuilder.Entity<ContentDraft>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("content_drafts_pkey");

            entity.ToTable("content_drafts");

            entity.HasIndex(e => new { e.PropertyId, e.UpdatedAt }, "content_drafts_property_updated_idx").IsDescending(false, true);

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.BodyHtml)
                .HasDefaultValueSql("''::text")
                .HasColumnName("body_html");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.GradeScore).HasColumnName("grade_score");
            entity.Property(e => e.GradeSnapshot)
                .HasColumnType("jsonb")
                .HasColumnName("grade_snapshot");
            entity.Property(e => e.LandingUrl).HasColumnName("landing_url");
            entity.Property(e => e.MetaDescription)
                .HasDefaultValueSql("''::text")
                .HasColumnName("meta_description");
            entity.Property(e => e.PropertyId).HasColumnName("property_id");
            entity.Property(e => e.Status)
                .HasDefaultValueSql("'draft'::text")
                .HasColumnName("status");
            entity.Property(e => e.TargetKeyword)
                .HasDefaultValueSql("''::text")
                .HasColumnName("target_keyword");
            entity.Property(e => e.Title)
                .HasDefaultValueSql("'Untitled draft'::text")
                .HasColumnName("title");
            entity.Property(e => e.TitleTag)
                .HasDefaultValueSql("''::text")
                .HasColumnName("title_tag");
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("updated_at");

            entity.HasOne<Property>().WithMany()
                .HasForeignKey(d => d.PropertyId)
                .HasConstraintName("content_drafts_property_id_fkey");
        });

        modelBuilder.Entity<CrawlPageHtml>(entity =>
        {
            entity.HasKey(e => new { e.CrawlRunId, e.Url }).HasName("crawl_page_html_pkey");

            entity.ToTable("crawl_page_html");

            entity.HasIndex(e => e.CrawlRunId, "idx_crawl_page_html_run");

            entity.Property(e => e.CrawlRunId).HasColumnName("crawl_run_id");
            entity.Property(e => e.Url).HasColumnName("url");
            entity.Property(e => e.ByteLength).HasColumnName("byte_length");
            entity.Property(e => e.CapturedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("captured_at");
            entity.Property(e => e.ContentType).HasColumnName("content_type");
            entity.Property(e => e.FetchMethod)
                .HasDefaultValueSql("'static'::text")
                .HasColumnName("fetch_method");
            entity.Property(e => e.Html).HasColumnName("html");
            entity.Property(e => e.Status).HasColumnName("status");

            entity.HasOne<CrawlRun>().WithMany()
                .HasForeignKey(d => d.CrawlRunId)
                .HasConstraintName("crawl_page_html_crawl_run_id_fkey");
        });

        modelBuilder.Entity<CrawlPageMarkdown>(entity =>
        {
            entity.HasKey(e => new { e.CrawlRunId, e.Url }).HasName("crawl_page_markdown_pkey");

            entity.ToTable("crawl_page_markdown");

            entity.HasIndex(e => e.PropertyId, "idx_crawl_page_markdown_property");

            entity.HasIndex(e => e.CrawlRunId, "idx_crawl_page_markdown_run");

            entity.Property(e => e.CrawlRunId).HasColumnName("crawl_run_id");
            entity.Property(e => e.Url).HasColumnName("url");
            entity.Property(e => e.ExtractedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("extracted_at");
            entity.Property(e => e.Markdown).HasColumnName("markdown");
            entity.Property(e => e.PropertyId).HasColumnName("property_id");
            entity.Property(e => e.SourceByteLength).HasColumnName("source_byte_length");
            entity.Property(e => e.Strategy)
                .HasDefaultValueSql("'main_only'::text")
                .HasColumnName("strategy");
            entity.Property(e => e.Title).HasColumnName("title");
            entity.Property(e => e.WordCount).HasColumnName("word_count");

            entity.HasOne<CrawlRun>().WithMany()
                .HasForeignKey(d => d.CrawlRunId)
                .HasConstraintName("crawl_page_markdown_crawl_run_id_fkey");

            entity.HasOne<Property>().WithMany()
                .HasForeignKey(d => d.PropertyId)
                .OnDelete(DeleteBehavior.SetNull)
                .HasConstraintName("crawl_page_markdown_property_id_fkey");
        });

        modelBuilder.Entity<CrawlResult>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("crawl_results_pkey");

            entity.ToTable("crawl_results");

            entity.HasIndex(e => new { e.CrawlRunId, e.Url }, "crawl_results_crawl_run_id_url_key").IsUnique();

            entity.HasIndex(e => e.CrawlRunId, "idx_crawl_results_run");

            entity.HasIndex(e => new { e.CrawlRunId, e.FetchMethod }, "idx_crawl_results_run_fetch_method");

            entity.HasIndex(e => new { e.CrawlRunId, e.Status }, "idx_crawl_results_run_status");

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.CrawlRunId).HasColumnName("crawl_run_id");
            entity.Property(e => e.Data)
                .HasColumnType("jsonb")
                .HasColumnName("data");
            entity.Property(e => e.FetchMethod)
                .HasDefaultValueSql("'static'::text")
                .HasColumnName("fetch_method");
            entity.Property(e => e.Status).HasColumnName("status");
            entity.Property(e => e.Title).HasColumnName("title");
            entity.Property(e => e.Url).HasColumnName("url");

            entity.HasOne<CrawlRun>().WithMany()
                .HasForeignKey(d => d.CrawlRunId)
                .HasConstraintName("crawl_results_crawl_run_id_fkey");
        });

        modelBuilder.Entity<CrawlRun>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("crawl_runs_pkey");

            entity.ToTable("crawl_runs");

            entity.HasIndex(e => e.PropertyId, "idx_crawl_runs_property");

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.DiscoveryMode)
                .HasDefaultValueSql("'spider'::text")
                .HasColumnName("discovery_mode");
            entity.Property(e => e.MobileRunId).HasColumnName("mobile_run_id");
            entity.Property(e => e.PauseState)
                .HasColumnType("jsonb")
                .HasColumnName("pause_state");
            entity.Property(e => e.PausedAt).HasColumnName("paused_at");
            entity.Property(e => e.PropertyId).HasColumnName("property_id");
            entity.Property(e => e.RenderMode)
                .HasDefaultValueSql("'static'::text")
                .HasColumnName("render_mode");
            entity.Property(e => e.StartUrl).HasColumnName("start_url");

            entity.HasOne<Property>().WithMany()
                .HasForeignKey(d => d.PropertyId)
                .OnDelete(DeleteBehavior.SetNull)
                .HasConstraintName("crawl_runs_property_id_fkey");
        });

        modelBuilder.Entity<CrawlSetting>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("crawl_settings_pkey");

            entity.ToTable("crawl_settings");

            entity.Property(e => e.Id)
                .HasDefaultValue(1L)
                .HasColumnName("id");
            entity.Property(e => e.AllowExternal)
                .HasDefaultValueSql("''::text")
                .HasColumnName("allow_external");
            entity.Property(e => e.CompareMobileDesktop)
                .HasDefaultValueSql("''::text")
                .HasColumnName("compare_mobile_desktop");
            entity.Property(e => e.CompetitorDomains)
                .HasDefaultValueSql("''::text")
                .HasColumnName("competitor_domains");
            entity.Property(e => e.Concurrency)
                .HasDefaultValueSql("''::text")
                .HasColumnName("concurrency");
            entity.Property(e => e.ContentAnalysisStrategy)
                .HasDefaultValueSql("''::text")
                .HasColumnName("content_analysis_strategy");
            entity.Property(e => e.ContentAnalysisWorkers)
                .HasDefaultValueSql("''::text")
                .HasColumnName("content_analysis_workers");
            entity.Property(e => e.ContentExcerptMaxChars)
                .HasDefaultValueSql("''::text")
                .HasColumnName("content_excerpt_max_chars");
            entity.Property(e => e.CrawlAuthUsername)
                .HasDefaultValueSql("''::text")
                .HasColumnName("crawl_auth_username");
            entity.Property(e => e.CrawlDiscoveryMode)
                .HasDefaultValueSql("''::text")
                .HasColumnName("crawl_discovery_mode");
            entity.Property(e => e.CrawlExcludeUrls)
                .HasDefaultValueSql("''::text")
                .HasColumnName("crawl_exclude_urls");
            entity.Property(e => e.CrawlExtraHeaders)
                .HasDefaultValueSql("''::text")
                .HasColumnName("crawl_extra_headers");
            entity.Property(e => e.CrawlIgnoreParams)
                .HasDefaultValueSql("''::text")
                .HasColumnName("crawl_ignore_params");
            entity.Property(e => e.CrawlJsBlockResources)
                .HasDefaultValueSql("''::text")
                .HasColumnName("crawl_js_block_resources");
            entity.Property(e => e.CrawlJsCaptureConsole)
                .HasDefaultValueSql("''::text")
                .HasColumnName("crawl_js_capture_console");
            entity.Property(e => e.CrawlJsCaptureFailedRequests)
                .HasDefaultValueSql("''::text")
                .HasColumnName("crawl_js_capture_failed_requests");
            entity.Property(e => e.CrawlJsConcurrency)
                .HasDefaultValueSql("''::text")
                .HasColumnName("crawl_js_concurrency");
            entity.Property(e => e.CrawlJsConsoleLevels)
                .HasDefaultValueSql("''::text")
                .HasColumnName("crawl_js_console_levels");
            entity.Property(e => e.CrawlJsConsoleMaxPerPage)
                .HasDefaultValueSql("''::text")
                .HasColumnName("crawl_js_console_max_per_page");
            entity.Property(e => e.CrawlJsExtraWaitMs)
                .HasDefaultValueSql("''::text")
                .HasColumnName("crawl_js_extra_wait_ms");
            entity.Property(e => e.CrawlJsTimeout)
                .HasDefaultValueSql("''::text")
                .HasColumnName("crawl_js_timeout");
            entity.Property(e => e.CrawlJsWaitUntil)
                .HasDefaultValueSql("''::text")
                .HasColumnName("crawl_js_wait_until");
            entity.Property(e => e.CrawlPathSegments)
                .HasDefaultValueSql("''::text")
                .HasColumnName("crawl_path_segments");
            entity.Property(e => e.CrawlRenderMode)
                .HasDefaultValueSql("''::text")
                .HasColumnName("crawl_render_mode");
            entity.Property(e => e.CrawlRobotsTxtOverride)
                .HasDefaultValueSql("''::text")
                .HasColumnName("crawl_robots_txt_override");
            entity.Property(e => e.CrawlStreamToDb)
                .HasDefaultValueSql("''::text")
                .HasColumnName("crawl_stream_to_db");
            entity.Property(e => e.CrawlUrlList)
                .HasDefaultValueSql("''::text")
                .HasColumnName("crawl_url_list");
            entity.Property(e => e.CrawlUserAgentCustom)
                .HasDefaultValueSql("''::text")
                .HasColumnName("crawl_user_agent_custom");
            entity.Property(e => e.CrawlUserAgentPreset)
                .HasDefaultValueSql("''::text")
                .HasColumnName("crawl_user_agent_preset");
            entity.Property(e => e.CustomExtractionRegex)
                .HasDefaultValueSql("''::text")
                .HasColumnName("custom_extraction_regex");
            entity.Property(e => e.CustomExtractors)
                .HasDefaultValueSql("''::text")
                .HasColumnName("custom_extractors");
            entity.Property(e => e.MainContentSelectors)
                .HasDefaultValueSql("''::text")
                .HasColumnName("main_content_selectors");
            entity.Property(e => e.BoilerplateSelectors)
                .HasDefaultValueSql("''::text")
                .HasColumnName("boilerplate_selectors");
            entity.Property(e => e.PipelineGraphJson)
                .HasDefaultValueSql("''::text")
                .HasColumnName("pipeline_graph_json");
            entity.Property(e => e.ExportLogoUrl)
                .HasDefaultValueSql("''::text")
                .HasColumnName("export_logo_url");
            entity.Property(e => e.IgnoreRobots)
                .HasDefaultValueSql("''::text")
                .HasColumnName("ignore_robots");
            entity.Property(e => e.MaxDepth)
                .HasDefaultValueSql("''::text")
                .HasColumnName("max_depth");
            entity.Property(e => e.MaxPages)
                .HasDefaultValueSql("''::text")
                .HasColumnName("max_pages");
            entity.Property(e => e.MaxStoredHtmlBytes)
                .HasDefaultValueSql("''::text")
                .HasColumnName("max_stored_html_bytes");
            entity.Property(e => e.PoliteDelay)
                .HasDefaultValueSql("''::text")
                .HasColumnName("polite_delay");
            entity.Property(e => e.PreserveCrawlHistory)
                .HasDefaultValueSql("''::text")
                .HasColumnName("preserve_crawl_history");
            entity.Property(e => e.RunContentAnalysis)
                .HasDefaultValueSql("''::text")
                .HasColumnName("run_content_analysis");
            entity.Property(e => e.StartUrl)
                .HasDefaultValueSql("''::text")
                .HasColumnName("start_url");
            entity.Property(e => e.StoreContentExcerpt)
                .HasDefaultValueSql("''::text")
                .HasColumnName("store_content_excerpt");
            entity.Property(e => e.StoreOutlinks)
                .HasDefaultValueSql("''::text")
                .HasColumnName("store_outlinks");
            entity.Property(e => e.StorePageHtml)
                .HasDefaultValueSql("''::text")
                .HasColumnName("store_page_html");
            entity.Property(e => e.Timeout)
                .HasDefaultValueSql("''::text")
                .HasColumnName("timeout");
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("updated_at");
        });

        modelBuilder.Entity<CruxSnapshot>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("crux_snapshots_pkey");

            entity.ToTable("crux_snapshots");

            entity.HasIndex(e => new { e.Origin, e.FetchedAt }, "idx_crux_snapshots_origin").IsDescending(false, true);

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.FetchedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("fetched_at");
            entity.Property(e => e.Metrics)
                .HasDefaultValueSql("'{}'::jsonb")
                .HasColumnType("jsonb")
                .HasColumnName("metrics");
            entity.Property(e => e.Origin).HasColumnName("origin");
            entity.Property(e => e.PropertyId).HasColumnName("property_id");
            entity.Property(e => e.Url).HasColumnName("url");

            entity.HasOne<Property>().WithMany()
                .HasForeignKey(d => d.PropertyId)
                .OnDelete(DeleteBehavior.Cascade)
                .HasConstraintName("crux_snapshots_property_id_fkey");
        });

        modelBuilder.Entity<Dashboard>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("dashboards_pkey");

            entity.ToTable("dashboards");

            entity.HasIndex(e => new { e.PropertyId, e.UpdatedAt }, "dashboards_property_updated_idx").IsDescending(false, true);

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.IsDefault).HasColumnName("is_default");
            entity.Property(e => e.LayoutJson)
                .HasDefaultValueSql("'{}'::jsonb")
                .HasColumnType("jsonb")
                .HasColumnName("layout_json");
            entity.Property(e => e.Name)
                .HasDefaultValueSql("'Untitled dashboard'::text")
                .HasColumnName("name");
            entity.Property(e => e.PropertyId).HasColumnName("property_id");
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("updated_at");

            entity.HasOne<Property>().WithMany()
                .HasForeignKey(d => d.PropertyId)
                .HasConstraintName("dashboards_property_id_fkey");
        });

        modelBuilder.Entity<Edge>(entity =>
        {
            entity.HasKey(e => new { e.CrawlRunId, e.FromUrl, e.ToUrl }).HasName("edges_pkey");

            entity.ToTable("edges");

            entity.Property(e => e.CrawlRunId).HasColumnName("crawl_run_id");
            entity.Property(e => e.FromUrl).HasColumnName("from_url");
            entity.Property(e => e.ToUrl).HasColumnName("to_url");

            entity.HasOne<CrawlRun>().WithMany()
                .HasForeignKey(d => d.CrawlRunId)
                .HasConstraintName("edges_crawl_run_id_fkey");
        });

        modelBuilder.Entity<ExportJob>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("export_jobs_pkey");

            entity.ToTable("export_jobs");

            entity.Property(e => e.Id)
                .ValueGeneratedNever()
                .HasColumnName("id");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.ErrorText).HasColumnName("error_text");
            entity.Property(e => e.FilePath).HasColumnName("file_path");
            entity.Property(e => e.FinishedAt).HasColumnName("finished_at");
            entity.Property(e => e.Format).HasColumnName("format");
            entity.Property(e => e.PropertyId).HasColumnName("property_id");
            entity.Property(e => e.ReportId).HasColumnName("report_id");
            entity.Property(e => e.Status)
                .HasDefaultValueSql("'pending'::text")
                .HasColumnName("status");

            entity.HasOne<Property>().WithMany()
                .HasForeignKey(d => d.PropertyId)
                .OnDelete(DeleteBehavior.SetNull)
                .HasConstraintName("export_jobs_property_id_fkey");
        });

        modelBuilder.Entity<FeatureFlag>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("feature_flags_pkey");

            entity.ToTable("feature_flags");

            entity.Property(e => e.Id)
                .HasDefaultValue(1L)
                .HasColumnName("id");
            entity.Property(e => e.ChatEnabled)
                .HasDefaultValue(true)
                .HasColumnName("chat_enabled");
            entity.Property(e => e.McpVisible)
                .HasDefaultValue(true)
                .HasColumnName("mcp_visible");
            entity.Property(e => e.PagesMdEnabled)
                .HasDefaultValue(true)
                .HasColumnName("pages_md_enabled");
            entity.Property(e => e.PipelineEnabled)
                .HasDefaultValue(true)
                .HasColumnName("pipeline_enabled");
            entity.Property(e => e.SecretsVisible)
                .HasDefaultValue(true)
                .HasColumnName("secrets_visible");
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("updated_at");
            entity.Property(e => e.WriteEnabled)
                .HasDefaultValue(true)
                .HasColumnName("write_enabled");
        });

        modelBuilder.Entity<GoogleAppSetting>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("google_app_settings_pkey");

            entity.ToTable("google_app_settings");

            entity.Property(e => e.Id)
                .HasDefaultValue(1L)
                .HasColumnName("id");
            entity.Property(e => e.ClientId).HasColumnName("client_id");
            entity.Property(e => e.ClientSecret).HasColumnName("client_secret");
            entity.Property(e => e.DefaultDateRangeDays)
                .HasDefaultValue(28)
                .HasColumnName("default_date_range_days");
            entity.Property(e => e.DeveloperToken).HasColumnName("developer_token");
            entity.Property(e => e.LoginCustomerId).HasColumnName("login_customer_id");
            entity.Property(e => e.ServiceAccountJson)
                .HasColumnType("jsonb")
                .HasColumnName("service_account_json");
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("updated_at");
        });

        modelBuilder.Entity<GoogleDatum>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("google_data_pkey");

            entity.ToTable("google_data");

            entity.HasIndex(e => new { e.PropertyId, e.FetchedAt }, "idx_google_data_property_fetched").IsDescending(false, true);

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.Data)
                .HasColumnType("jsonb")
                .HasColumnName("data");
            entity.Property(e => e.FetchedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("fetched_at");
            entity.Property(e => e.PropertyId).HasColumnName("property_id");

            entity.HasOne<Property>().WithMany()
                .HasForeignKey(d => d.PropertyId)
                .OnDelete(DeleteBehavior.SetNull)
                .HasConstraintName("google_data_property_id_fkey");
        });

        modelBuilder.Entity<GooglePipelineSetting>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("google_pipeline_settings_pkey");

            entity.ToTable("google_pipeline_settings");

            entity.Property(e => e.Id)
                .HasDefaultValue(1L)
                .HasColumnName("id");
            entity.Property(e => e.EnableGoogleAnalytics)
                .HasDefaultValueSql("''::text")
                .HasColumnName("enable_google_analytics");
            entity.Property(e => e.EnableGoogleKeywordPlanner)
                .HasDefaultValueSql("''::text")
                .HasColumnName("enable_google_keyword_planner");
            entity.Property(e => e.EnableGoogleSearchConsole)
                .HasDefaultValueSql("''::text")
                .HasColumnName("enable_google_search_console");
            entity.Property(e => e.EnableKeywordForecast)
                .HasDefaultValueSql("''::text")
                .HasColumnName("enable_keyword_forecast");
            entity.Property(e => e.EnrichKeywordsAfterReport)
                .HasDefaultValueSql("''::text")
                .HasColumnName("enrich_keywords_after_report");
            entity.Property(e => e.GoogleAdsGeoIds)
                .HasDefaultValueSql("''::text")
                .HasColumnName("google_ads_geo_ids");
            entity.Property(e => e.GoogleAdsLanguageId)
                .HasDefaultValueSql("''::text")
                .HasColumnName("google_ads_language_id");
            entity.Property(e => e.GoogleDateRangeDays)
                .HasDefaultValueSql("''::text")
                .HasColumnName("google_date_range_days");
            entity.Property(e => e.GoogleUrlGapListLimit)
                .HasDefaultValueSql("''::text")
                .HasColumnName("google_url_gap_list_limit");
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("updated_at");
        });

        modelBuilder.Entity<GscLinksDatum>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("gsc_links_data_pkey");

            entity.ToTable("gsc_links_data");

            entity.HasIndex(e => new { e.PropertyId, e.FetchedAt }, "idx_gsc_links_data_property_fetched").IsDescending(false, true);

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.Data)
                .HasColumnType("jsonb")
                .HasColumnName("data");
            entity.Property(e => e.FetchedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("fetched_at");
            entity.Property(e => e.PropertyId).HasColumnName("property_id");

            entity.HasOne<Property>().WithMany()
                .HasForeignKey(d => d.PropertyId)
                .HasConstraintName("gsc_links_data_property_id_fkey");
        });

        modelBuilder.Entity<GscLinksSnapshot>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("gsc_links_snapshots_pkey");

            entity.ToTable("gsc_links_snapshots");

            entity.HasIndex(e => new { e.PropertyId, e.FetchedAt }, "idx_gsc_links_snapshots_property").IsDescending(false, true);

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.FetchedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("fetched_at");
            entity.Property(e => e.PropertyId).HasColumnName("property_id");
            entity.Property(e => e.ReferringDomains).HasColumnName("referring_domains");
            entity.Property(e => e.TopDomains)
                .HasDefaultValueSql("'[]'::jsonb")
                .HasColumnType("jsonb")
                .HasColumnName("top_domains");

            entity.HasOne<Property>().WithMany()
                .HasForeignKey(d => d.PropertyId)
                .HasConstraintName("gsc_links_snapshots_property_id_fkey");
        });

        modelBuilder.Entity<IntegrationSecret>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("integration_secrets_pkey");

            entity.ToTable("integration_secrets");

            entity.Property(e => e.Id)
                .HasDefaultValue(1L)
                .HasColumnName("id");
            entity.Property(e => e.BingWebmasterApiKey)
                .HasDefaultValueSql("''::text")
                .HasColumnName("bing_webmaster_api_key");
            entity.Property(e => e.CrawlAuthPassword)
                .HasDefaultValueSql("''::text")
                .HasColumnName("crawl_auth_password");
            entity.Property(e => e.CrawlCookies)
                .HasDefaultValueSql("''::text")
                .HasColumnName("crawl_cookies");
            entity.Property(e => e.GoogleRichResultsApiKey)
                .HasDefaultValueSql("''::text")
                .HasColumnName("google_rich_results_api_key");
            entity.Property(e => e.SerpApiKey)
                .HasDefaultValueSql("''::text")
                .HasColumnName("serp_api_key");
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("updated_at");
        });

        modelBuilder.Entity<IssueStatus>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("issue_status_pkey");

            entity.ToTable("issue_status");

            entity.HasIndex(e => new { e.PropertyId, e.Status }, "idx_issue_status_property");

            entity.HasIndex(e => e.ReportId, "idx_issue_status_report");

            entity.HasIndex(e => new { e.PropertyId, e.IssueFingerprint }, "issue_status_property_id_issue_fingerprint_key").IsUnique();

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.Assignee).HasColumnName("assignee");
            entity.Property(e => e.CategoryId).HasColumnName("category_id");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.IssueFingerprint).HasColumnName("issue_fingerprint");
            entity.Property(e => e.Message).HasColumnName("message");
            entity.Property(e => e.Note).HasColumnName("note");
            entity.Property(e => e.Priority)
                .HasDefaultValueSql("'Medium'::text")
                .HasColumnName("priority");
            entity.Property(e => e.PropertyId).HasColumnName("property_id");
            entity.Property(e => e.ReportId).HasColumnName("report_id");
            entity.Property(e => e.Status)
                .HasDefaultValueSql("'open'::text")
                .HasColumnName("status");
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("updated_at");
            entity.Property(e => e.Url)
                .HasDefaultValueSql("''::text")
                .HasColumnName("url");

            entity.HasOne<Property>().WithMany()
                .HasForeignKey(d => d.PropertyId)
                .HasConstraintName("issue_status_property_id_fkey");
        });

        modelBuilder.Entity<KeywordDatum>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("keyword_data_pkey");

            entity.ToTable("keyword_data");

            entity.HasIndex(e => new { e.PropertyId, e.FetchedAt }, "idx_keyword_data_property_fetched").IsDescending(false, true);

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.Data)
                .HasColumnType("jsonb")
                .HasColumnName("data");
            entity.Property(e => e.FetchedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("fetched_at");
            entity.Property(e => e.PropertyId).HasColumnName("property_id");

            entity.HasOne<Property>().WithMany()
                .HasForeignKey(d => d.PropertyId)
                .OnDelete(DeleteBehavior.Cascade)
                .HasConstraintName("keyword_data_property_id_fkey");
        });

        modelBuilder.Entity<KeywordHistory>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("keyword_history_pkey");

            entity.ToTable("keyword_history");

            entity.HasIndex(e => new { e.PropertyId, e.Keyword, e.FetchedAt }, "idx_keyword_history_property_kw").IsDescending(false, false, true);

            entity.HasIndex(e => new { e.Keyword, e.Id }, "idx_kw_history_keyword_id").IsDescending(false, true);

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.Clicks).HasColumnName("clicks");
            entity.Property(e => e.Ctr).HasColumnName("ctr");
            entity.Property(e => e.FetchedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("fetched_at");
            entity.Property(e => e.Impressions).HasColumnName("impressions");
            entity.Property(e => e.Keyword).HasColumnName("keyword");
            entity.Property(e => e.Position).HasColumnName("position");
            entity.Property(e => e.PropertyId).HasColumnName("property_id");

            entity.HasOne<Property>().WithMany()
                .HasForeignKey(d => d.PropertyId)
                .OnDelete(DeleteBehavior.Cascade)
                .HasConstraintName("keyword_history_property_id_fkey");
        });

        modelBuilder.Entity<KeywordSetting>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("keyword_settings_pkey");

            entity.ToTable("keyword_settings");

            entity.Property(e => e.Id)
                .HasDefaultValue(1L)
                .HasColumnName("id");
            entity.Property(e => e.BrandName)
                .HasDefaultValueSql("''::text")
                .HasColumnName("brand_name");
            entity.Property(e => e.EnableDatamuse)
                .HasDefaultValueSql("''::text")
                .HasColumnName("enable_datamuse");
            entity.Property(e => e.EnableGoogleSuggest)
                .HasDefaultValueSql("''::text")
                .HasColumnName("enable_google_suggest");
            entity.Property(e => e.EnableGoogleTrends)
                .HasDefaultValueSql("''::text")
                .HasColumnName("enable_google_trends");
            entity.Property(e => e.EnableWikipediaTopic)
                .HasDefaultValueSql("''::text")
                .HasColumnName("enable_wikipedia_topic");
            entity.Property(e => e.KeywordGscMaxRows)
                .HasDefaultValueSql("''::text")
                .HasColumnName("keyword_gsc_max_rows");
            entity.Property(e => e.KeywordMaxPages)
                .HasDefaultValueSql("''::text")
                .HasColumnName("keyword_max_pages");
            entity.Property(e => e.KeywordMaxSuggestResults)
                .HasDefaultValueSql("''::text")
                .HasColumnName("keyword_max_suggest_results");
            entity.Property(e => e.KeywordSeeds)
                .HasDefaultValueSql("''::text")
                .HasColumnName("keyword_seeds");
            entity.Property(e => e.KeywordSuggestTopN)
                .HasDefaultValueSql("''::text")
                .HasColumnName("keyword_suggest_top_n");
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("updated_at");
        });

        modelBuilder.Entity<KeywordSuggestCache>(entity =>
        {
            entity.HasKey(e => e.CacheKey).HasName("keyword_suggest_cache_pkey");

            entity.ToTable("keyword_suggest_cache");

            entity.Property(e => e.CacheKey).HasColumnName("cache_key");
            entity.Property(e => e.Data)
                .HasColumnType("jsonb")
                .HasColumnName("data");
            entity.Property(e => e.FetchedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("fetched_at");
        });

        modelBuilder.Entity<LhAudit>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("lh_audits_pkey");

            entity.ToTable("lh_audits");

            entity.HasIndex(e => e.AuditId, "idx_lh_audits_audit_id");

            entity.HasIndex(e => new { e.RunId, e.AuditId }, "idx_lh_audits_run_audit");

            entity.HasIndex(e => e.RunId, "idx_lh_audits_run_id");

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.AuditId).HasColumnName("audit_id");
            entity.Property(e => e.CategoryId).HasColumnName("category_id");
            entity.Property(e => e.Description).HasColumnName("description");
            entity.Property(e => e.DetailsHeadings)
                .HasColumnType("jsonb")
                .HasColumnName("details_headings");
            entity.Property(e => e.DetailsMeta)
                .HasColumnType("jsonb")
                .HasColumnName("details_meta");
            entity.Property(e => e.DetailsType).HasColumnName("details_type");
            entity.Property(e => e.DisplayValue).HasColumnName("display_value");
            entity.Property(e => e.HelpText).HasColumnName("help_text");
            entity.Property(e => e.NumericValue).HasColumnName("numeric_value");
            entity.Property(e => e.RunId).HasColumnName("run_id");
            entity.Property(e => e.Score).HasColumnName("score");
            entity.Property(e => e.ScoreDisplayMode).HasColumnName("score_display_mode");
            entity.Property(e => e.Title).HasColumnName("title");

            entity.HasOne<LighthouseRun>().WithMany()
                .HasForeignKey(d => d.RunId)
                .HasConstraintName("lh_audits_run_id_fkey");
        });

        modelBuilder.Entity<LhAuditItem>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("lh_audit_items_pkey");

            entity.ToTable("lh_audit_items");

            entity.HasIndex(e => e.AuditRowId, "idx_lh_audit_items_audit_row");

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.AuditRowId).HasColumnName("audit_row_id");
            entity.Property(e => e.ItemIndex).HasColumnName("item_index");
            entity.Property(e => e.RowData)
                .HasColumnType("jsonb")
                .HasColumnName("row_data");

            entity.HasOne<LhAudit>().WithMany()
                .HasForeignKey(d => d.AuditRowId)
                .HasConstraintName("lh_audit_items_audit_row_id_fkey");
        });

        modelBuilder.Entity<LighthousePageSummary>(entity =>
        {
            entity.HasKey(e => e.Url).HasName("lighthouse_page_summaries_pkey");

            entity.ToTable("lighthouse_page_summaries");

            entity.Property(e => e.Url).HasColumnName("url");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.Data)
                .HasColumnType("jsonb")
                .HasColumnName("data");
        });

        modelBuilder.Entity<LighthouseRun>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("lighthouse_runs_pkey");

            entity.ToTable("lighthouse_runs");

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.Data)
                .HasColumnType("jsonb")
                .HasColumnName("data");
            entity.Property(e => e.RunIndex).HasColumnName("run_index");
            entity.Property(e => e.Strategy).HasColumnName("strategy");
            entity.Property(e => e.Url).HasColumnName("url");
        });

        modelBuilder.Entity<LighthouseSetting>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("lighthouse_settings_pkey");

            entity.ToTable("lighthouse_settings");

            entity.Property(e => e.Id)
                .HasDefaultValue(1L)
                .HasColumnName("id");
            entity.Property(e => e.EnableAmpAudit)
                .HasDefaultValueSql("''::text")
                .HasColumnName("enable_amp_audit");
            entity.Property(e => e.EnableAxe)
                .HasDefaultValueSql("''::text")
                .HasColumnName("enable_axe");
            entity.Property(e => e.EnableCrux)
                .HasDefaultValueSql("''::text")
                .HasColumnName("enable_crux");
            entity.Property(e => e.EnableHtmlValidation)
                .HasDefaultValueSql("''::text")
                .HasColumnName("enable_html_validation");
            entity.Property(e => e.EnableRichResultsValidation)
                .HasDefaultValueSql("''::text")
                .HasColumnName("enable_rich_results_validation");
            entity.Property(e => e.EnableSpellCheck)
                .HasDefaultValueSql("''::text")
                .HasColumnName("enable_spell_check");
            entity.Property(e => e.EnableWaybackLookup)
                .HasDefaultValueSql("''::text")
                .HasColumnName("enable_wayback_lookup");
            entity.Property(e => e.LighthouseCategories)
                .HasDefaultValueSql("''::text")
                .HasColumnName("lighthouse_categories");
            entity.Property(e => e.LighthouseConcurrency)
                .HasDefaultValueSql("''::text")
                .HasColumnName("lighthouse_concurrency");
            entity.Property(e => e.LighthouseIterations)
                .HasDefaultValueSql("''::text")
                .HasColumnName("lighthouse_iterations");
            entity.Property(e => e.LighthouseMaxPages)
                .HasDefaultValueSql("''::text")
                .HasColumnName("lighthouse_max_pages");
            entity.Property(e => e.LighthouseMode)
                .HasDefaultValueSql("''::text")
                .HasColumnName("lighthouse_mode");
            entity.Property(e => e.LighthouseStrategy)
                .HasDefaultValueSql("''::text")
                .HasColumnName("lighthouse_strategy");
            entity.Property(e => e.LighthouseUrl)
                .HasDefaultValueSql("''::text")
                .HasColumnName("lighthouse_url");
            entity.Property(e => e.RunLighthouse)
                .HasDefaultValueSql("''::text")
                .HasColumnName("run_lighthouse");
            entity.Property(e => e.RunLighthouseOnPages)
                .HasDefaultValueSql("''::text")
                .HasColumnName("run_lighthouse_on_pages");
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("updated_at");
        });

        modelBuilder.Entity<LighthouseSummary>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("lighthouse_summary_pkey");

            entity.ToTable("lighthouse_summary");

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.Data)
                .HasColumnType("jsonb")
                .HasColumnName("data");
        });

        modelBuilder.Entity<LinkEdge>(entity =>
        {
            entity.HasKey(e => new { e.CrawlRunId, e.FromUrl, e.ToUrl, e.AnchorText, e.Rel }).HasName("link_edges_pkey");

            entity.ToTable("link_edges");

            entity.HasIndex(e => new { e.CrawlRunId, e.FromUrl }, "idx_link_edges_run_from");

            entity.HasIndex(e => new { e.CrawlRunId, e.ToUrl }, "idx_link_edges_run_to");

            entity.Property(e => e.CrawlRunId).HasColumnName("crawl_run_id");
            entity.Property(e => e.FromUrl).HasColumnName("from_url");
            entity.Property(e => e.ToUrl).HasColumnName("to_url");
            entity.Property(e => e.AnchorText)
                .HasDefaultValueSql("''::text")
                .HasColumnName("anchor_text");
            entity.Property(e => e.Rel)
                .HasDefaultValueSql("''::text")
                .HasColumnName("rel");
            entity.Property(e => e.IsNofollow).HasColumnName("is_nofollow");
            entity.Property(e => e.IsSponsored).HasColumnName("is_sponsored");
            entity.Property(e => e.IsUgc).HasColumnName("is_ugc");
            entity.Property(e => e.LinkType)
                .HasDefaultValueSql("'internal'::text")
                .HasColumnName("link_type");
            entity.Property(e => e.Position)
                .HasDefaultValueSql("'content'::text")
                .HasColumnName("position");

            entity.HasOne<CrawlRun>().WithMany()
                .HasForeignKey(d => d.CrawlRunId)
                .HasConstraintName("link_edges_crawl_run_id_fkey");
        });

        modelBuilder.Entity<LlmCache>(entity =>
        {
            entity.HasKey(e => e.CacheKey).HasName("llm_cache_pkey");

            entity.ToTable("llm_cache");

            entity.Property(e => e.CacheKey).HasColumnName("cache_key");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.ResponseJson)
                .HasColumnType("jsonb")
                .HasColumnName("response_json");
        });

        modelBuilder.Entity<LlmProviderProfile>(entity =>
        {
            entity.HasKey(e => e.Provider).HasName("llm_provider_profiles_pkey");

            entity.ToTable("llm_provider_profiles");

            entity.Property(e => e.Provider).HasColumnName("provider");
            entity.Property(e => e.ApiKey)
                .HasDefaultValueSql("''::text")
                .HasColumnName("api_key");
            entity.Property(e => e.ApiKeyUpdatedAt).HasColumnName("api_key_updated_at");
            entity.Property(e => e.SavedModel)
                .HasDefaultValueSql("''::text")
                .HasColumnName("saved_model");
        });

        modelBuilder.Entity<LlmSetting>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("llm_settings_pkey");

            entity.ToTable("llm_settings");

            entity.Property(e => e.Id)
                .HasDefaultValue(1L)
                .HasColumnName("id");
            entity.Property(e => e.ActiveModel)
                .HasDefaultValueSql("''::text")
                .HasColumnName("active_model");
            entity.Property(e => e.BatchSize)
                .HasDefaultValue(5)
                .HasColumnName("batch_size");
            entity.Property(e => e.ChatAllowCrawl).HasColumnName("chat_allow_crawl");
            entity.Property(e => e.ChatAssistantAvatarUrl)
                .HasDefaultValueSql("''::text")
                .HasColumnName("chat_assistant_avatar_url");
            entity.Property(e => e.ChatAssistantName)
                .HasDefaultValueSql("'AI Assistant'::text")
                .HasColumnName("chat_assistant_name");
            entity.Property(e => e.ChatFastNarrative).HasColumnName("chat_fast_narrative");
            entity.Property(e => e.ChatUnlimitedToolRounds).HasColumnName("chat_unlimited_tool_rounds");
            entity.Property(e => e.Concurrency)
                .HasDefaultValue(2)
                .HasColumnName("concurrency");
            entity.Property(e => e.EnableAuditSummary)
                .HasDefaultValue(true)
                .HasColumnName("enable_audit_summary");
            entity.Property(e => e.EnableContentStudio)
                .HasDefaultValue(true)
                .HasColumnName("enable_content_studio");
            entity.Property(e => e.EnableDashboards)
                .HasDefaultValue(true)
                .HasColumnName("enable_dashboards");
            entity.Property(e => e.EnableIssueFixes)
                .HasDefaultValue(true)
                .HasColumnName("enable_issue_fixes");
            entity.Property(e => e.EnableKeyphrases)
                .HasDefaultValue(true)
                .HasColumnName("enable_keyphrases");
            entity.Property(e => e.EnableKeywordClusters)
                .HasDefaultValue(true)
                .HasColumnName("enable_keyword_clusters");
            entity.Property(e => e.EnableNer)
                .HasDefaultValue(true)
                .HasColumnName("enable_ner");
            entity.Property(e => e.EnablePageCoach)
                .HasDefaultValue(true)
                .HasColumnName("enable_page_coach");
            entity.Property(e => e.EnableSimilarInternal)
                .HasDefaultValue(true)
                .HasColumnName("enable_similar_internal");
            entity.Property(e => e.Enabled).HasColumnName("enabled");
            entity.Property(e => e.MaxPages)
                .HasDefaultValue(60)
                .HasColumnName("max_pages");
            entity.Property(e => e.OllamaBaseUrl)
                .HasDefaultValueSql("'http://127.0.0.1:11434'::text")
                .HasColumnName("ollama_base_url");
            entity.Property(e => e.Provider)
                .HasDefaultValueSql("'none'::text")
                .HasColumnName("provider");
            entity.Property(e => e.SimilarTopK)
                .HasDefaultValue(5)
                .HasColumnName("similar_top_k");
            entity.Property(e => e.TimeoutSeconds)
                .HasDefaultValue(120)
                .HasColumnName("timeout_seconds");
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("updated_at");
        });

        modelBuilder.Entity<LogFileUpload>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("log_file_uploads_pkey");

            entity.ToTable("log_file_uploads");

            entity.HasIndex(e => new { e.PropertyId, e.UploadedAt }, "idx_log_uploads_property").IsDescending(false, true);

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.Analysis)
                .HasDefaultValueSql("'{}'::jsonb")
                .HasColumnType("jsonb")
                .HasColumnName("analysis");
            entity.Property(e => e.Filename).HasColumnName("filename");
            entity.Property(e => e.LineCount).HasColumnName("line_count");
            entity.Property(e => e.PropertyId).HasColumnName("property_id");
            entity.Property(e => e.UploadedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("uploaded_at");

            entity.HasOne<Property>().WithMany()
                .HasForeignKey(d => d.PropertyId)
                .HasConstraintName("log_file_uploads_property_id_fkey");
        });

        modelBuilder.Entity<McpSetting>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("mcp_settings_pkey");

            entity.ToTable("mcp_settings");

            entity.Property(e => e.Id)
                .HasDefaultValue(1L)
                .HasColumnName("id");
            entity.Property(e => e.AllowedHosts)
                .HasDefaultValueSql("''::text")
                .HasColumnName("allowed_hosts");
            entity.Property(e => e.AllowedOrigins)
                .HasDefaultValueSql("''::text")
                .HasColumnName("allowed_origins");
            entity.Property(e => e.BearerToken)
                .HasDefaultValueSql("''::text")
                .HasColumnName("bearer_token");
            entity.Property(e => e.DisabledTools)
                .HasDefaultValueSql("''::text")
                .HasColumnName("disabled_tools");
            entity.Property(e => e.EnabledDomains)
                .HasDefaultValueSql("'[\"core\",\"insight\"]'::text")
                .HasColumnName("enabled_domains");
            entity.Property(e => e.PublicUrl)
                .HasDefaultValueSql("''::text")
                .HasColumnName("public_url");
            entity.Property(e => e.ToolBundle)
                .HasDefaultValueSql("'core'::text")
                .HasColumnName("tool_bundle");
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("updated_at");
        });

        modelBuilder.Entity<Node>(entity =>
        {
            entity.HasKey(e => new { e.CrawlRunId, e.Url }).HasName("nodes_pkey");

            entity.ToTable("nodes");

            entity.Property(e => e.CrawlRunId).HasColumnName("crawl_run_id");
            entity.Property(e => e.Url).HasColumnName("url");
            entity.Property(e => e.Count).HasColumnName("count");

            entity.HasOne<CrawlRun>().WithMany()
                .HasForeignKey(d => d.CrawlRunId)
                .HasConstraintName("nodes_crawl_run_id_fkey");
        });

        modelBuilder.Entity<PageGoogleSnapshot>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("page_google_snapshots_pkey");

            entity.ToTable("page_google_snapshots");

            entity.HasIndex(e => new { e.UrlNorm, e.FetchedAt }, "ix_page_google_snapshots_url_norm_fetched").IsDescending(false, true);

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.Data)
                .HasColumnType("jsonb")
                .HasColumnName("data");
            entity.Property(e => e.FetchedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("fetched_at");
            entity.Property(e => e.PageUrl).HasColumnName("page_url");
            entity.Property(e => e.UrlNorm).HasColumnName("url_norm");
        });

        modelBuilder.Entity<PipelineJob>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("pipeline_jobs_pkey");

            entity.ToTable("pipeline_jobs");

            entity.HasIndex(e => e.StartedAt, "idx_pipeline_jobs_started").IsDescending();

            entity.Property(e => e.Id)
                .ValueGeneratedNever()
                .HasColumnName("id");
            entity.Property(e => e.CancelRequested).HasColumnName("cancel_requested");
            entity.Property(e => e.Command).HasColumnName("command");
            entity.Property(e => e.ConfigHash).HasColumnName("config_hash");
            entity.Property(e => e.ErrorText).HasColumnName("error_text");
            entity.Property(e => e.ExitCode).HasColumnName("exit_code");
            entity.Property(e => e.FinishedAt).HasColumnName("finished_at");
            entity.Property(e => e.JobType)
                .HasDefaultValueSql("'pipeline'::text")
                .HasColumnName("job_type");
            entity.Property(e => e.LogText)
                .HasDefaultValueSql("''::text")
                .HasColumnName("log_text");
            entity.Property(e => e.LogTruncated).HasColumnName("log_truncated");
            entity.Property(e => e.PauseRequested).HasColumnName("pause_requested");
            entity.Property(e => e.PropertyId).HasColumnName("property_id");
            entity.Property(e => e.StartedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("started_at");
            entity.Property(e => e.Status)
                .HasDefaultValueSql("'running'::text")
                .HasColumnName("status");
            entity.Property(e => e.WorkerPid).HasColumnName("worker_pid");

            entity.HasOne<Property>().WithMany()
                .HasForeignKey(d => d.PropertyId)
                .OnDelete(DeleteBehavior.SetNull)
                .HasConstraintName("pipeline_jobs_property_id_fkey");
        });

        modelBuilder.Entity<Property>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("properties_pkey");

            entity.ToTable("properties");

            entity.HasIndex(e => e.CanonicalDomain, "idx_properties_domain");

            entity.HasIndex(e => e.CanonicalDomain, "properties_canonical_domain_key").IsUnique();

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.AlertEmail).HasColumnName("alert_email");
            entity.Property(e => e.AlertWebhookUrl).HasColumnName("alert_webhook_url");
            entity.Property(e => e.CanonicalDomain).HasColumnName("canonical_domain");
            entity.Property(e => e.CrawlAuthorizedAt).HasColumnName("crawl_authorized_at");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.DefaultCrawlPreset).HasColumnName("default_crawl_preset");
            entity.Property(e => e.Ga4PropertyId).HasColumnName("ga4_property_id");
            entity.Property(e => e.GoogleAuthMode).HasColumnName("google_auth_mode");
            entity.Property(e => e.GoogleConnectedAt).HasColumnName("google_connected_at");
            entity.Property(e => e.GoogleConnectedEmail).HasColumnName("google_connected_email");
            entity.Property(e => e.GoogleDateRangeDays).HasColumnName("google_date_range_days");
            entity.Property(e => e.GoogleRefreshToken).HasColumnName("google_refresh_token");
            entity.Property(e => e.GscSiteUrl).HasColumnName("gsc_site_url");
            entity.Property(e => e.Name).HasColumnName("name");
            entity.Property(e => e.ScheduleCron).HasColumnName("schedule_cron");
            entity.Property(e => e.SiteUrl).HasColumnName("site_url");
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("updated_at");
        });

        modelBuilder.Entity<ReportPayload>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("report_payload_pkey");

            entity.ToTable("report_payload");

            entity.HasIndex(e => e.CanonicalDomain, "idx_report_payload_canonical_domain");

            entity.HasIndex(e => e.GeneratedAt, "idx_report_payload_generated_at").IsDescending();

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.CanonicalDomain).HasColumnName("canonical_domain");
            entity.Property(e => e.Data)
                .HasColumnType("jsonb")
                .HasColumnName("data");
            entity.Property(e => e.GeneratedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("generated_at");
            entity.Property(e => e.SiteName).HasColumnName("site_name");
        });

        modelBuilder.Entity<ReportSetting>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("report_settings_pkey");

            entity.ToTable("report_settings");

            entity.Property(e => e.Id)
                .HasDefaultValue(1L)
                .HasColumnName("id");
            entity.Property(e => e.EnableRdapOrgLookup)
                .HasDefaultValueSql("''::text")
                .HasColumnName("enable_rdap_org_lookup");
            entity.Property(e => e.EnableSubdomainDiscovery)
                .HasDefaultValueSql("''::text")
                .HasColumnName("enable_subdomain_discovery");
            entity.Property(e => e.ImageProbeConcurrency)
                .HasDefaultValueSql("''::text")
                .HasColumnName("image_probe_concurrency");
            entity.Property(e => e.ImageProbeTimeout)
                .HasDefaultValueSql("''::text")
                .HasColumnName("image_probe_timeout");
            entity.Property(e => e.ImageUnoptimizedMinKb)
                .HasDefaultValueSql("''::text")
                .HasColumnName("image_unoptimized_min_kb");
            entity.Property(e => e.IncludeKeywordOpportunities)
                .HasDefaultValueSql("''::text")
                .HasColumnName("include_keyword_opportunities");
            entity.Property(e => e.MaxFetchForEdges)
                .HasDefaultValueSql("''::text")
                .HasColumnName("max_fetch_for_edges");
            entity.Property(e => e.MaxImageProbeUrls)
                .HasDefaultValueSql("''::text")
                .HasColumnName("max_image_probe_urls");
            entity.Property(e => e.MaxNodesPlot)
                .HasDefaultValueSql("''::text")
                .HasColumnName("max_nodes_plot");
            entity.Property(e => e.OutboundDomainMaxRows)
                .HasDefaultValueSql("''::text")
                .HasColumnName("outbound_domain_max_rows");
            entity.Property(e => e.ProbeImageInventory)
                .HasDefaultValueSql("''::text")
                .HasColumnName("probe_image_inventory");
            entity.Property(e => e.ReportTitle)
                .HasDefaultValueSql("''::text")
                .HasColumnName("report_title");
            entity.Property(e => e.RunSecurityScan)
                .HasDefaultValueSql("''::text")
                .HasColumnName("run_security_scan");
            entity.Property(e => e.SameDomainOnly)
                .HasDefaultValueSql("''::text")
                .HasColumnName("same_domain_only");
            entity.Property(e => e.SecurityMaxUrlsProbe)
                .HasDefaultValueSql("''::text")
                .HasColumnName("security_max_urls_probe");
            entity.Property(e => e.SecurityScanActive)
                .HasDefaultValueSql("''::text")
                .HasColumnName("security_scan_active");
            entity.Property(e => e.SiteName)
                .HasDefaultValueSql("''::text")
                .HasColumnName("site_name");
            entity.Property(e => e.SubdomainCtLookup)
                .HasDefaultValueSql("''::text")
                .HasColumnName("subdomain_ct_lookup");
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("updated_at");
        });

        modelBuilder.Entity<SavedCrawlFilter>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("saved_crawl_filters_pkey");

            entity.ToTable("saved_crawl_filters");

            entity.HasIndex(e => e.PropertyId, "idx_saved_crawl_filters_property");

            entity.HasIndex(e => new { e.PropertyId, e.Name }, "saved_crawl_filters_property_id_name_key").IsUnique();

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.FilterJson)
                .HasDefaultValueSql("'{}'::jsonb")
                .HasColumnType("jsonb")
                .HasColumnName("filter_json");
            entity.Property(e => e.Name).HasColumnName("name");
            entity.Property(e => e.PropertyId).HasColumnName("property_id");

            entity.HasOne<Property>().WithMany()
                .HasForeignKey(d => d.PropertyId)
                .HasConstraintName("saved_crawl_filters_property_id_fkey");
        });

        modelBuilder.Entity<UiPreference>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("ui_preferences_pkey");

            entity.ToTable("ui_preferences");

            entity.Property(e => e.Id)
                .HasDefaultValue(1L)
                .HasColumnName("id");
            entity.Property(e => e.BrandLogoUrl)
                .HasDefaultValueSql("''::text")
                .HasColumnName("brand_logo_url");
            entity.Property(e => e.BrandName)
                .HasDefaultValueSql("''::text")
                .HasColumnName("brand_name");
            entity.Property(e => e.BrandSubtitle)
                .HasDefaultValueSql("''::text")
                .HasColumnName("brand_subtitle");
            entity.Property(e => e.CustomThemeJson)
                .HasColumnType("jsonb")
                .HasColumnName("custom_theme_json");
            entity.Property(e => e.UiPrefsJson)
                .HasColumnType("jsonb")
                .HasColumnName("ui_prefs_json");
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("updated_at");
        });

        modelBuilder.Entity<WorkspaceSetting>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("workspace_settings_pkey");

            entity.ToTable("workspace_settings");

            entity.Property(e => e.Id)
                .HasDefaultValue(1L)
                .HasColumnName("id");
            entity.Property(e => e.ActivePropertyId).HasColumnName("active_property_id");
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("updated_at");
            entity.Property(e => e.WarningMapperInput)
                .HasDefaultValueSql("''::text")
                .HasColumnName("warning_mapper_input");
            entity.Property(e => e.WarningMapperInputType)
                .HasDefaultValueSql("'lighthouse'::text")
                .HasColumnName("warning_mapper_input_type");
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
