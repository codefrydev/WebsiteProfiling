namespace Data.Domain.Entities;

/// <summary>
/// Mapping of the Alembic-owned <c>saved_crawl_filters</c> table (Links page saved filter presets).
/// </summary>
public sealed class SavedCrawlFilter
{
    public long Id { get; set; }

    public long PropertyId { get; set; }

    public string Name { get; set; } = string.Empty;

    /// <summary><c>filter_json JSONB</c> stored as raw JSON text.</summary>
    public string FilterJson { get; set; } = "{}";

    public DateTimeOffset CreatedAt { get; set; }
}
