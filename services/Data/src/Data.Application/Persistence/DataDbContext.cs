using Data.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Data.Application.Persistence;

/// <summary>
/// Read-only EF Core context over the Alembic-owned schema. It NEVER creates or migrates tables:
/// there is no <c>Microsoft.EntityFrameworkCore.Design</c> reference and no <c>Migrations/</c> folder,
/// and <c>Migrate()</c>/<c>EnsureCreated()</c> are never called. Tracking is disabled globally.
/// </summary>
public sealed class DataDbContext(DbContextOptions<DataDbContext> options) : DbContext(options)
{
    public DbSet<ReportPayload> ReportPayloads => Set<ReportPayload>();

    public DbSet<CrawlRun> CrawlRuns => Set<CrawlRun>();

    public DbSet<CrawlResult> CrawlResults => Set<CrawlResult>();

    public DbSet<IssueStatus> IssueStatuses => Set<IssueStatus>();

    public DbSet<SavedCrawlFilter> SavedCrawlFilters => Set<SavedCrawlFilter>();

    public DbSet<GoogleData> GoogleDataRows => Set<GoogleData>();

    public DbSet<Property> Properties => Set<Property>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
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

        modelBuilder.Entity<CrawlRun>(e =>
        {
            e.ToTable("crawl_runs");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
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
            e.Property(x => x.Data).HasColumnName("data").HasColumnType("jsonb");
        });

        modelBuilder.Entity<IssueStatus>(e =>
        {
            e.ToTable("issue_status");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.PropertyId).HasColumnName("property_id");
            e.Property(x => x.ReportId).HasColumnName("report_id");
            e.Property(x => x.IssueFingerprint).HasColumnName("issue_fingerprint");
            e.Property(x => x.CategoryId).HasColumnName("category_id");
            e.Property(x => x.Message).HasColumnName("message");
            e.Property(x => x.Url).HasColumnName("url");
            e.Property(x => x.Priority).HasColumnName("priority");
            e.Property(x => x.Status).HasColumnName("status");
            e.Property(x => x.Assignee).HasColumnName("assignee");
            e.Property(x => x.Note).HasColumnName("note");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
            e.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        });

        modelBuilder.Entity<SavedCrawlFilter>(e =>
        {
            e.ToTable("saved_crawl_filters");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.PropertyId).HasColumnName("property_id");
            e.Property(x => x.Name).HasColumnName("name");
            e.Property(x => x.FilterJson).HasColumnName("filter_json").HasColumnType("jsonb");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
        });

        modelBuilder.Entity<GoogleData>(e =>
        {
            e.ToTable("google_data");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.FetchedAt).HasColumnName("fetched_at");
            e.Property(x => x.PropertyId).HasColumnName("property_id");
            e.Property(x => x.Data).HasColumnName("data").HasColumnType("jsonb");
        });

        modelBuilder.Entity<Property>(e =>
        {
            e.ToTable("properties");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.CanonicalDomain).HasColumnName("canonical_domain");
        });
    }
}
