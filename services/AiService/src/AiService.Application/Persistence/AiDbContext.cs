using AiService.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace AiService.Application.Persistence;

/// <summary>
/// EF Core context over the schema owned by services/Schema. Never calls <c>Migrate()</c> or <c>EnsureCreated()</c>.
/// </summary>
public sealed class AiDbContext(DbContextOptions<AiDbContext> options) : DbContext(options)
{
    public DbSet<LlmCacheEntry> LlmCache => Set<LlmCacheEntry>();

    public DbSet<ChatSession> ChatSessions => Set<ChatSession>();

    public DbSet<ChatMessage> ChatMessages => Set<ChatMessage>();

    public DbSet<ReportPayload> ReportPayloads => Set<ReportPayload>();

    public DbSet<LlmSettingsEntry> LlmSettings => Set<LlmSettingsEntry>();

    public DbSet<LlmProviderProfileEntry> LlmProviderProfiles => Set<LlmProviderProfileEntry>();

    public DbSet<IntegrationSecretsEntry> IntegrationSecrets => Set<IntegrationSecretsEntry>();

    public DbSet<McpSettingsEntry> McpSettings => Set<McpSettingsEntry>();

    public DbSet<FeatureFlagsEntry> FeatureFlags => Set<FeatureFlagsEntry>();

    public DbSet<GoogleAppSettingsEntry> GoogleAppSettings => Set<GoogleAppSettingsEntry>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<LlmCacheEntry>(e =>
        {
            e.ToTable("llm_cache");
            e.HasKey(x => x.CacheKey);
            e.Property(x => x.CacheKey).HasColumnName("cache_key");
            e.Property(x => x.ResponseJson).HasColumnName("response_json").HasColumnType("jsonb");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
        });

        modelBuilder.Entity<ChatSession>(e =>
        {
            e.ToTable("chat_sessions");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.PropertyId).HasColumnName("property_id");
            e.Property(x => x.Title).HasColumnName("title");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
            e.Property(x => x.UpdatedAt).HasColumnName("updated_at");
            e.HasMany(x => x.Messages).WithOne(x => x.Session).HasForeignKey(x => x.SessionId);
        });

        modelBuilder.Entity<ChatMessage>(e =>
        {
            e.ToTable("chat_messages");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.SessionId).HasColumnName("session_id");
            e.Property(x => x.Role).HasColumnName("role");
            e.Property(x => x.Content).HasColumnName("content");
            e.Property(x => x.ToolName).HasColumnName("tool_name");
            e.Property(x => x.ToolArgs).HasColumnName("tool_args").HasColumnType("jsonb");
            e.Property(x => x.ToolResult).HasColumnName("tool_result").HasColumnType("jsonb");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
        });

        modelBuilder.Entity<ReportPayload>(e =>
        {
            e.ToTable("report_payload");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.GeneratedAt).HasColumnName("generated_at");
            e.Property(x => x.SiteName).HasColumnName("site_name");
            e.Property(x => x.CanonicalDomain).HasColumnName("canonical_domain");
            e.Property(x => x.Data).HasColumnName("data").HasColumnType("jsonb");
        });

        modelBuilder.Entity<LlmSettingsEntry>(e =>
        {
            e.ToTable("llm_settings");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.Enabled).HasColumnName("enabled");
            e.Property(x => x.Provider).HasColumnName("provider");
            e.Property(x => x.ActiveModel).HasColumnName("active_model");
            e.Property(x => x.OllamaBaseUrl).HasColumnName("ollama_base_url");
            e.Property(x => x.EnableNer).HasColumnName("enable_ner");
            e.Property(x => x.EnableKeyphrases).HasColumnName("enable_keyphrases");
            e.Property(x => x.EnableSimilarInternal).HasColumnName("enable_similar_internal");
            e.Property(x => x.EnableKeywordClusters).HasColumnName("enable_keyword_clusters");
            e.Property(x => x.EnableIssueFixes).HasColumnName("enable_issue_fixes");
            e.Property(x => x.EnableAuditSummary).HasColumnName("enable_audit_summary");
            e.Property(x => x.EnablePageCoach).HasColumnName("enable_page_coach");
            e.Property(x => x.EnableContentStudio).HasColumnName("enable_content_studio");
            e.Property(x => x.EnableDashboards).HasColumnName("enable_dashboards");
            e.Property(x => x.ChatAssistantName).HasColumnName("chat_assistant_name");
            e.Property(x => x.ChatAssistantAvatarUrl).HasColumnName("chat_assistant_avatar_url");
            e.Property(x => x.ChatUnlimitedToolRounds).HasColumnName("chat_unlimited_tool_rounds");
            e.Property(x => x.ChatAllowCrawl).HasColumnName("chat_allow_crawl");
            e.Property(x => x.ChatFastNarrative).HasColumnName("chat_fast_narrative");
            e.Property(x => x.MaxPages).HasColumnName("max_pages");
            e.Property(x => x.BatchSize).HasColumnName("batch_size");
            e.Property(x => x.Concurrency).HasColumnName("concurrency");
            e.Property(x => x.TimeoutSeconds).HasColumnName("timeout_seconds");
            e.Property(x => x.SimilarTopK).HasColumnName("similar_top_k");
            e.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        });

        modelBuilder.Entity<LlmProviderProfileEntry>(e =>
        {
            e.ToTable("llm_provider_profiles");
            e.HasKey(x => x.Provider);
            e.Property(x => x.Provider).HasColumnName("provider");
            e.Property(x => x.ApiKey).HasColumnName("api_key");
            e.Property(x => x.SavedModel).HasColumnName("saved_model");
            e.Property(x => x.ApiKeyUpdatedAt).HasColumnName("api_key_updated_at");
        });

        modelBuilder.Entity<IntegrationSecretsEntry>(e =>
        {
            e.ToTable("integration_secrets");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.BingWebmasterApiKey).HasColumnName("bing_webmaster_api_key");
            e.Property(x => x.SerpApiKey).HasColumnName("serp_api_key");
            e.Property(x => x.GoogleRichResultsApiKey).HasColumnName("google_rich_results_api_key");
            e.Property(x => x.CrawlAuthPassword).HasColumnName("crawl_auth_password");
            e.Property(x => x.CrawlCookies).HasColumnName("crawl_cookies");
            e.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        });

        modelBuilder.Entity<McpSettingsEntry>(e =>
        {
            e.ToTable("mcp_settings");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.BearerToken).HasColumnName("bearer_token");
            e.Property(x => x.AllowedHosts).HasColumnName("allowed_hosts");
            e.Property(x => x.AllowedOrigins).HasColumnName("allowed_origins");
            e.Property(x => x.PublicUrl).HasColumnName("public_url");
            e.Property(x => x.ToolBundle).HasColumnName("tool_bundle");
            e.Property(x => x.DisabledTools).HasColumnName("disabled_tools");
            e.Property(x => x.EnabledDomains).HasColumnName("enabled_domains");
            e.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        });

        modelBuilder.Entity<FeatureFlagsEntry>(e =>
        {
            e.ToTable("feature_flags");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.PipelineEnabled).HasColumnName("pipeline_enabled");
            e.Property(x => x.WriteEnabled).HasColumnName("write_enabled");
            e.Property(x => x.PagesMdEnabled).HasColumnName("pages_md_enabled");
            e.Property(x => x.ChatEnabled).HasColumnName("chat_enabled");
            e.Property(x => x.McpVisible).HasColumnName("mcp_visible");
            e.Property(x => x.SecretsVisible).HasColumnName("secrets_visible");
            e.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        });

        modelBuilder.Entity<GoogleAppSettingsEntry>(e =>
        {
            e.ToTable("google_app_settings");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.ClientId).HasColumnName("client_id");
            e.Property(x => x.ClientSecret).HasColumnName("client_secret");
            e.Property(x => x.ServiceAccountJson).HasColumnName("service_account_json").HasColumnType("jsonb");
            e.Property(x => x.DefaultDateRangeDays).HasColumnName("default_date_range_days");
            e.Property(x => x.UpdatedAt).HasColumnName("updated_at");
            e.Property(x => x.DeveloperToken).HasColumnName("developer_token");
            e.Property(x => x.LoginCustomerId).HasColumnName("login_customer_id");
        });
    }
}
