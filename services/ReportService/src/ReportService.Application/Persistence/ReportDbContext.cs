using Microsoft.EntityFrameworkCore;
using ReportService.Domain.Entities;

namespace ReportService.Application.Persistence;

/// <summary>
/// EF Core context over the Alembic-owned schema. No migrations; tracking disabled globally for reads.
/// Mirrors Data and FileService DbContext patterns.
/// </summary>
public sealed class ReportDbContext(DbContextOptions<ReportDbContext> options) : DbContext(options)
{
    public DbSet<CrawlRun> CrawlRuns => Set<CrawlRun>();

    public DbSet<CrawlResult> CrawlResults => Set<CrawlResult>();

    public DbSet<LighthousePageSummary> LighthousePageSummaries => Set<LighthousePageSummary>();

    public DbSet<ReportPayload> ReportPayloads => Set<ReportPayload>();

    public DbSet<AuditHealthSnapshot> AuditHealthSnapshots => Set<AuditHealthSnapshot>();

    public DbSet<LinkEdge> LinkEdges => Set<LinkEdge>();

    public DbSet<CrawlGraphEdge> CrawlGraphEdges => Set<CrawlGraphEdge>();

    public DbSet<LighthouseGlobalSummary> LighthouseGlobalSummaries => Set<LighthouseGlobalSummary>();

    public DbSet<PipelineJob> PipelineJobs => Set<PipelineJob>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<CrawlRun>(e =>
        {
            e.ToTable("crawl_runs");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.PropertyId).HasColumnName("property_id");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
            e.Property(x => x.StartUrl).HasColumnName("start_url");
            e.Property(x => x.RenderMode).HasColumnName("render_mode");
            e.Property(x => x.DiscoveryMode).HasColumnName("discovery_mode");
            e.Property(x => x.MobileRunId).HasColumnName("mobile_run_id");
        });

        modelBuilder.Entity<CrawlResult>(e =>
        {
            e.ToTable("crawl_results");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.CrawlRunId).HasColumnName("crawl_run_id");
            e.Property(x => x.Url).HasColumnName("url");
            e.Property(x => x.Status).HasColumnName("status");
            e.Property(x => x.Title).HasColumnName("title");
            e.Property(x => x.FetchMethod).HasColumnName("fetch_method");
            e.Property(x => x.Data).HasColumnName("data").HasColumnType("jsonb");
        });

        modelBuilder.Entity<LighthousePageSummary>(e =>
        {
            e.ToTable("lighthouse_page_summaries");
            e.HasKey(x => x.Url);
            e.Property(x => x.Url).HasColumnName("url");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
            e.Property(x => x.Data).HasColumnName("data").HasColumnType("jsonb");
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

        modelBuilder.Entity<AuditHealthSnapshot>(e =>
        {
            e.ToTable("audit_health_snapshots");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.PropertyId).HasColumnName("property_id");
            e.Property(x => x.ReportId).HasColumnName("report_id");
            e.Property(x => x.CanonicalDomain).HasColumnName("canonical_domain");
            e.Property(x => x.HealthScore).HasColumnName("health_score");
            e.Property(x => x.CategoryScores).HasColumnName("category_scores").HasColumnType("jsonb");
            e.Property(x => x.IssueCounts).HasColumnName("issue_counts").HasColumnType("jsonb");
            e.Property(x => x.GeneratedAt).HasColumnName("generated_at");
        });

        modelBuilder.Entity<LinkEdge>(e =>
        {
            e.ToTable("link_edges");
            e.HasKey(x => new { x.CrawlRunId, x.FromUrl, x.ToUrl, x.AnchorText, x.Rel });
            e.Property(x => x.CrawlRunId).HasColumnName("crawl_run_id");
            e.Property(x => x.FromUrl).HasColumnName("from_url");
            e.Property(x => x.ToUrl).HasColumnName("to_url");
            e.Property(x => x.AnchorText).HasColumnName("anchor_text");
            e.Property(x => x.Rel).HasColumnName("rel");
            e.Property(x => x.IsNofollow).HasColumnName("is_nofollow");
            e.Property(x => x.IsSponsored).HasColumnName("is_sponsored");
            e.Property(x => x.IsUgc).HasColumnName("is_ugc");
            e.Property(x => x.LinkType).HasColumnName("link_type");
            e.Property(x => x.Position).HasColumnName("position");
        });

        modelBuilder.Entity<CrawlGraphEdge>(e =>
        {
            e.ToTable("edges");
            e.HasKey(x => new { x.CrawlRunId, x.FromUrl, x.ToUrl });
            e.Property(x => x.CrawlRunId).HasColumnName("crawl_run_id");
            e.Property(x => x.FromUrl).HasColumnName("from_url");
            e.Property(x => x.ToUrl).HasColumnName("to_url");
        });

        modelBuilder.Entity<LighthouseGlobalSummary>(e =>
        {
            e.ToTable("lighthouse_summary");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
            e.Property(x => x.Data).HasColumnName("data").HasColumnType("jsonb");
        });

        modelBuilder.Entity<PipelineJob>(e =>
        {
            e.ToTable("pipeline_jobs");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.JobType).HasColumnName("job_type");
            e.Property(x => x.Status).HasColumnName("status");
            e.Property(x => x.ExitCode).HasColumnName("exit_code");
            e.Property(x => x.LogText).HasColumnName("log_text");
            e.Property(x => x.ErrorText).HasColumnName("error_text");
            e.Property(x => x.PropertyId).HasColumnName("property_id");
            e.Property(x => x.ConfigHash).HasColumnName("config_hash");
            e.Property(x => x.StartedAt).HasColumnName("started_at");
            e.Property(x => x.FinishedAt).HasColumnName("finished_at");
            e.Property(x => x.LogTruncated).HasColumnName("log_truncated");
            e.Property(x => x.Command).HasColumnName("command");
            e.Property(x => x.CancelRequested).HasColumnName("cancel_requested");
            e.Property(x => x.PauseRequested).HasColumnName("pause_requested");
            e.Property(x => x.WorkerPid).HasColumnName("worker_pid");
        });
    }
}
