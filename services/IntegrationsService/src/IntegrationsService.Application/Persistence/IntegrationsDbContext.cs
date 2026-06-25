using IntegrationsService.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace IntegrationsService.Application.Persistence;

/// <summary>
/// EF Core context over the Alembic-owned schema. Does not run migrations; tables are owned by Python Alembic.
/// </summary>
public sealed class IntegrationsDbContext(DbContextOptions<IntegrationsDbContext> options) : DbContext(options)
{
    public DbSet<GoogleData> GoogleDataRows => Set<GoogleData>();

    public DbSet<Property> Properties => Set<Property>();

    public DbSet<GoogleAppSettings> GoogleAppSettings => Set<GoogleAppSettings>();

    public DbSet<PageGoogleSnapshot> PageGoogleSnapshots => Set<PageGoogleSnapshot>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
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
            e.Property(x => x.Name).HasColumnName("name");
            e.Property(x => x.CanonicalDomain).HasColumnName("canonical_domain");
            e.Property(x => x.SiteUrl).HasColumnName("site_url");
            e.Property(x => x.GscSiteUrl).HasColumnName("gsc_site_url");
            e.Property(x => x.Ga4PropertyId).HasColumnName("ga4_property_id");
            e.Property(x => x.GoogleAuthMode).HasColumnName("google_auth_mode");
            e.Property(x => x.GoogleRefreshToken).HasColumnName("google_refresh_token");
            e.Property(x => x.GoogleConnectedAt).HasColumnName("google_connected_at");
            e.Property(x => x.GoogleConnectedEmail).HasColumnName("google_connected_email");
            e.Property(x => x.GoogleDateRangeDays).HasColumnName("google_date_range_days");
            e.Property(x => x.DefaultCrawlPreset).HasColumnName("default_crawl_preset");
            e.Property(x => x.CrawlAuthorizedAt).HasColumnName("crawl_authorized_at");
        });

        modelBuilder.Entity<GoogleAppSettings>(e =>
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

        modelBuilder.Entity<PageGoogleSnapshot>(e =>
        {
            e.ToTable("page_google_snapshots");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.PageUrl).HasColumnName("page_url");
            e.Property(x => x.UrlNorm).HasColumnName("url_norm");
            e.Property(x => x.FetchedAt).HasColumnName("fetched_at");
            e.Property(x => x.Data).HasColumnName("data").HasColumnType("jsonb");
        });
    }
}
