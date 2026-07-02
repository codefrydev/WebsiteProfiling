using Microsoft.EntityFrameworkCore;
using Schema.Model.Entities;

namespace Schema.Model.Persistence;

/// <summary>
/// Hand-written additions to the scaffolded <see cref="SchemaDbContext"/> model. Lives in a separate
/// file (via <c>OnModelCreatingPartial</c>) so re-running <c>dotnet ef dbcontext scaffold --force</c>
/// never clobbers it.
/// </summary>
public partial class SchemaDbContext
{
    partial void OnModelCreatingPartial(ModelBuilder modelBuilder)
    {
        // crawl_runs.mobile_run_id: self-referencing FK, widened to bigint (was integer under the old
        // Alembic-managed schema) specifically so it's a normal EF relationship instead of a raw SQL
        // workaround. ClientSetNull (EF's own default for optional FKs) generates no ON DELETE clause,
        // matching the original DDL's implicit Postgres NO ACTION.
        modelBuilder.Entity<CrawlRun>(e =>
            e.HasOne<CrawlRun>().WithMany()
                .HasForeignKey(x => x.MobileRunId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("crawl_runs_mobile_run_id_fkey"));

        // 15 singleton tables enforce a single row via `id BIGINT PRIMARY KEY DEFAULT 1 CHECK (id = 1)`.
        // Constraint names below match Postgres's own auto-generated `<table>_<column>_check` naming
        // (the Alembic migrations never named them explicitly) so the EF-generated DDL is byte-identical.
        AddSingletonCheck<AuditStepSetting>(modelBuilder, "audit_step_settings", "audit_step_settings_id_check");
        AddSingletonCheck<ClientPreference>(modelBuilder, "client_preferences", "client_preferences_id_check");
        AddSingletonCheck<ContentAnalysisSetting>(modelBuilder, "content_analysis_settings", "content_analysis_settings_id_check");
        AddSingletonCheck<CrawlSetting>(modelBuilder, "crawl_settings", "crawl_settings_id_check");
        AddSingletonCheck<FeatureFlag>(modelBuilder, "feature_flags", "feature_flags_id_check");
        AddSingletonCheck<GoogleAppSetting>(modelBuilder, "google_app_settings", "google_app_settings_id_check");
        AddSingletonCheck<GooglePipelineSetting>(modelBuilder, "google_pipeline_settings", "google_pipeline_settings_id_check");
        AddSingletonCheck<IntegrationSecret>(modelBuilder, "integration_secrets", "integration_secrets_id_check");
        AddSingletonCheck<KeywordSetting>(modelBuilder, "keyword_settings", "keyword_settings_id_check");
        AddSingletonCheck<LighthouseSetting>(modelBuilder, "lighthouse_settings", "lighthouse_settings_id_check");
        AddSingletonCheck<LlmSetting>(modelBuilder, "llm_settings", "llm_settings_id_check");
        AddSingletonCheck<McpSetting>(modelBuilder, "mcp_settings", "mcp_settings_id_check");
        AddSingletonCheck<ReportSetting>(modelBuilder, "report_settings", "report_settings_id_check");
        AddSingletonCheck<UiPreference>(modelBuilder, "ui_preferences", "ui_preferences_id_check");
        AddSingletonCheck<WorkspaceSetting>(modelBuilder, "workspace_settings", "workspace_settings_id_check");

        // Column-level CHECK constraints (not tied to the singleton pattern above).
        modelBuilder.Entity<ChatMessage>(e =>
            e.ToTable("chat_messages", tb => tb.HasCheckConstraint(
                "chat_messages_role_check", "role IN ('user', 'assistant', 'tool')")));

        modelBuilder.Entity<ContentDraft>(e =>
            e.ToTable("content_drafts", tb => tb.HasCheckConstraint(
                "content_drafts_status_check", "status IN ('draft', 'ready', 'archived')")));

        // Scaffold silently drops a column's DEFAULT when it equals the CLR type's own zero-value
        // (false for bool, 0 for int) — it treats that case as "no default worth annotating" even
        // though the live column genuinely has one. Missing these means the generated CreateTable
        // wouldn't apply the default, so any INSERT that omits the column (including this project's
        // own singleton seed rows) fails with a NOT NULL violation instead of getting the default.
        modelBuilder.Entity<ClientPreference>(e => e.Property(x => x.SidebarCollapsed).HasDefaultValue(false));
        modelBuilder.Entity<CrawlPageHtml>(e => e.Property(x => x.ByteLength).HasDefaultValue(0));
        modelBuilder.Entity<CrawlPageMarkdown>(e =>
        {
            e.Property(x => x.SourceByteLength).HasDefaultValue(0);
            e.Property(x => x.WordCount).HasDefaultValue(0);
        });
        modelBuilder.Entity<Dashboard>(e => e.Property(x => x.IsDefault).HasDefaultValue(false));
        modelBuilder.Entity<GscLinksSnapshot>(e => e.Property(x => x.ReferringDomains).HasDefaultValue(0));
        modelBuilder.Entity<LinkEdge>(e =>
        {
            e.Property(x => x.IsNofollow).HasDefaultValue(false);
            e.Property(x => x.IsSponsored).HasDefaultValue(false);
            e.Property(x => x.IsUgc).HasDefaultValue(false);
        });
        modelBuilder.Entity<LlmSetting>(e =>
        {
            e.Property(x => x.ChatAllowCrawl).HasDefaultValue(false);
            e.Property(x => x.ChatFastNarrative).HasDefaultValue(false);
            e.Property(x => x.ChatUnlimitedToolRounds).HasDefaultValue(false);
            e.Property(x => x.Enabled).HasDefaultValue(false);
        });
        modelBuilder.Entity<LogFileUpload>(e => e.Property(x => x.LineCount).HasDefaultValue(0));
        modelBuilder.Entity<PipelineJob>(e =>
        {
            e.Property(x => x.CancelRequested).HasDefaultValue(false);
            e.Property(x => x.LogTruncated).HasDefaultValue(false);
            e.Property(x => x.PauseRequested).HasDefaultValue(false);

            // DB-level single-flight guarantee: "at most one pending/running job at a time".
            // A Postgres partial unique index needs every covered row to collide on the SAME
            // indexed value to express "at most one row may match this predicate" — indexing
            // the real `status` column would only block two rows sharing the *same* status
            // (e.g. two 'pending' rows), not one 'pending' + one 'running' simultaneously.
            // SingleActiveSlot is a shadow column that is always the constant 1 — never set by
            // Python's INSERT or by EF, Postgres fills it from DEFAULT — indexed only among
            // active rows via HasFilter. Must stay NOT NULL: Postgres never treats two NULLs
            // as equal for uniqueness, so a nullable column here would silently defeat this.
            e.Property<int>("SingleActiveSlot")
                .HasColumnName("single_active_slot")
                .HasDefaultValue(1);

            e.HasIndex(new[] { "SingleActiveSlot" }, "idx_pipeline_jobs_single_active")
                .IsUnique()
                .HasFilter("status IN ('pending', 'running')");
        });
    }

    private static void AddSingletonCheck<TEntity>(ModelBuilder modelBuilder, string tableName, string constraintName)
        where TEntity : class
    {
        modelBuilder.Entity<TEntity>(e =>
            e.ToTable(tableName, tb => tb.HasCheckConstraint(constraintName, "id = 1")));
    }
}
