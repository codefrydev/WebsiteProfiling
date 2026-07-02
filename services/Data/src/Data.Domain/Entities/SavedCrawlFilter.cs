namespace Data.Domain.Entities;

/// <summary>
/// Mapping of the <c>saved_crawl_filters</c> table (schema owned by services/Schema; Links page saved filter presets).
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
