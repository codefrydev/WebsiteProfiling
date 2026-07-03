using Microsoft.EntityFrameworkCore;

using AiService.Tools.Persistence;
namespace AiService.Tools.Persistence;

public sealed class ReportPayloadRow
{
    public long Id { get; set; }

    public string Data { get; set; } = "{}";
}

public sealed class GoogleDataRow
{
    public long Id { get; set; }

    public long? PropertyId { get; set; }

    public string Data { get; set; } = "{}";
}

public sealed class KeywordDataRow
{
    public long Id { get; set; }

    public long? PropertyId { get; set; }

    public DateTimeOffset FetchedAt { get; set; }

    public string Data { get; set; } = "{}";
}

public sealed class KeywordHistoryRow
{
    public long Id { get; set; }

    public long? PropertyId { get; set; }

    public string Keyword { get; set; } = "";

    public DateTimeOffset FetchedAt { get; set; }

    public double? Position { get; set; }

    public int? Clicks { get; set; }

    public int? Impressions { get; set; }

    public double? Ctr { get; set; }
}

public sealed class GscLinksDataRow
{
    public long Id { get; set; }

    public long? PropertyId { get; set; }

    public string Data { get; set; } = "{}";
}

public sealed class PropertyRow
{
    public long Id { get; set; }

    public string? Name { get; set; }

    public string? CanonicalDomain { get; set; }

    public string? GoogleRefreshToken { get; set; }

    public string? GscSiteUrl { get; set; }
}

public sealed class CrawlRunRow
{
    public long Id { get; set; }
}

public sealed class CrawlResultRow
{
    public long Id { get; set; }

    public long CrawlRunId { get; set; }

    public string Url { get; set; } = "";

    public string FetchMethod { get; set; } = "static";

    public string Data { get; set; } = "{}";
}

public sealed class AuditHealthSnapshotRow
{
    public long Id { get; set; }

    public long? PropertyId { get; set; }

    public long ReportId { get; set; }

    public int? HealthScore { get; set; }

    public DateTimeOffset GeneratedAt { get; set; }

    public string CategoryScores { get; set; } = "{}";

    public string IssueCounts { get; set; } = "{}";
}

public sealed class GscLinksSnapshotRow
{
    public long Id { get; set; }

    public long PropertyId { get; set; }

    public DateTimeOffset FetchedAt { get; set; }

    public int ReferringDomains { get; set; }

    public string TopDomains { get; set; } = "[]";
}

public sealed class AuditToolsDbContext(DbContextOptions<AuditToolsDbContext> options) : DbContext(options)
{
    public DbSet<ReportPayloadRow> ReportPayloads => Set<ReportPayloadRow>();

    public DbSet<GoogleDataRow> GoogleData => Set<GoogleDataRow>();

    public DbSet<KeywordDataRow> KeywordData => Set<KeywordDataRow>();

    public DbSet<KeywordHistoryRow> KeywordHistory => Set<KeywordHistoryRow>();

    public DbSet<GscLinksDataRow> GscLinksData => Set<GscLinksDataRow>();

    public DbSet<PropertyRow> Properties => Set<PropertyRow>();

    public DbSet<CrawlRunRow> CrawlRuns => Set<CrawlRunRow>();

    public DbSet<CrawlResultRow> CrawlResults => Set<CrawlResultRow>();

    public DbSet<AuditHealthSnapshotRow> AuditHealthSnapshots => Set<AuditHealthSnapshotRow>();

    public DbSet<GscLinksSnapshotRow> GscLinksSnapshots => Set<GscLinksSnapshotRow>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<ReportPayloadRow>(e =>
        {
            e.ToTable("report_payload");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.Data).HasColumnName("data").HasColumnType("jsonb");
        });

        modelBuilder.Entity<GoogleDataRow>(e =>
        {
            e.ToTable("google_data");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.PropertyId).HasColumnName("property_id");
            e.Property(x => x.Data).HasColumnName("data").HasColumnType("jsonb");
        });

        modelBuilder.Entity<KeywordDataRow>(e =>
        {
            e.ToTable("keyword_data");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.PropertyId).HasColumnName("property_id");
            e.Property(x => x.FetchedAt).HasColumnName("fetched_at");
            e.Property(x => x.Data).HasColumnName("data").HasColumnType("jsonb");
        });

        modelBuilder.Entity<KeywordHistoryRow>(e =>
        {
            e.ToTable("keyword_history");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.PropertyId).HasColumnName("property_id");
            e.Property(x => x.Keyword).HasColumnName("keyword");
            e.Property(x => x.FetchedAt).HasColumnName("fetched_at");
            e.Property(x => x.Position).HasColumnName("position");
            e.Property(x => x.Clicks).HasColumnName("clicks");
            e.Property(x => x.Impressions).HasColumnName("impressions");
            e.Property(x => x.Ctr).HasColumnName("ctr");
        });

        modelBuilder.Entity<GscLinksDataRow>(e =>
        {
            e.ToTable("gsc_links_data");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.PropertyId).HasColumnName("property_id");
            e.Property(x => x.Data).HasColumnName("data").HasColumnType("jsonb");
        });

        modelBuilder.Entity<PropertyRow>(e =>
        {
            e.ToTable("properties");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.Name).HasColumnName("name");
            e.Property(x => x.CanonicalDomain).HasColumnName("canonical_domain");
            e.Property(x => x.GoogleRefreshToken).HasColumnName("google_refresh_token");
            e.Property(x => x.GscSiteUrl).HasColumnName("gsc_site_url");
        });

        modelBuilder.Entity<CrawlRunRow>(e =>
        {
            e.ToTable("crawl_runs");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
        });

        modelBuilder.Entity<CrawlResultRow>(e =>
        {
            e.ToTable("crawl_results");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.CrawlRunId).HasColumnName("crawl_run_id");
            e.Property(x => x.Url).HasColumnName("url");
            e.Property(x => x.FetchMethod).HasColumnName("fetch_method");
            e.Property(x => x.Data).HasColumnName("data").HasColumnType("jsonb");
        });

        modelBuilder.Entity<AuditHealthSnapshotRow>(e =>
        {
            e.ToTable("audit_health_snapshots");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.PropertyId).HasColumnName("property_id");
            e.Property(x => x.ReportId).HasColumnName("report_id");
            e.Property(x => x.HealthScore).HasColumnName("health_score");
            e.Property(x => x.GeneratedAt).HasColumnName("generated_at");
            e.Property(x => x.CategoryScores).HasColumnName("category_scores").HasColumnType("jsonb");
            e.Property(x => x.IssueCounts).HasColumnName("issue_counts").HasColumnType("jsonb");
        });

        modelBuilder.Entity<GscLinksSnapshotRow>(e =>
        {
            e.ToTable("gsc_links_snapshots");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.PropertyId).HasColumnName("property_id");
            e.Property(x => x.FetchedAt).HasColumnName("fetched_at");
            e.Property(x => x.ReferringDomains).HasColumnName("referring_domains");
            e.Property(x => x.TopDomains).HasColumnName("top_domains").HasColumnType("jsonb");
        });
    }
}
