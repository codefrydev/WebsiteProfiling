using AiService.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace AiService.Application.Persistence;

/// <summary>
/// EF Core context over the Alembic-owned schema. Never calls <c>Migrate()</c> or <c>EnsureCreated()</c>.
/// </summary>
public sealed class AiDbContext(DbContextOptions<AiDbContext> options) : DbContext(options)
{
    public DbSet<LlmCacheEntry> LlmCache => Set<LlmCacheEntry>();

    public DbSet<ChatSession> ChatSessions => Set<ChatSession>();

    public DbSet<ChatMessage> ChatMessages => Set<ChatMessage>();

    public DbSet<ReportPayload> ReportPayloads => Set<ReportPayload>();

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
    }
}
