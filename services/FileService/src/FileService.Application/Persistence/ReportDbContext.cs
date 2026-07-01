using FileService.Domain.Models;
using Microsoft.EntityFrameworkCore;

namespace FileService.Application.Persistence;

/// <summary>
/// Read-only EF Core context over the <c>report_payload</c> table (schema owned by services/Schema). It NEVER creates or
/// migrates tables (no Design reference, no Migrations folder, Migrate()/EnsureCreated() never called)
/// and tracking is disabled globally. Mirrors the Data service's DataDbContext, scoped to just the
/// one table FileService needs to render exports.
/// </summary>
public sealed class ReportDbContext(DbContextOptions<ReportDbContext> options) : DbContext(options)
{
    public DbSet<ReportPayloadRow> ReportPayloads => Set<ReportPayloadRow>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<ReportPayloadRow>(e =>
        {
            e.ToTable("report_payload");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.GeneratedAt).HasColumnName("generated_at");
            e.Property(x => x.SiteName).HasColumnName("site_name");
            e.Property(x => x.CanonicalDomain).HasColumnName("canonical_domain");
            e.Property(x => x.Data).HasColumnName("data").HasColumnType("jsonb");
        });
    }
}
