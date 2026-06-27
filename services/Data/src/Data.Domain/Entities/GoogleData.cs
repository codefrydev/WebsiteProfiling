namespace Data.Domain.Entities;

/// <summary>Read-only mapping of <c>google_data</c> (GSC/GA4 snapshots per property).</summary>
public sealed class GoogleData
{
    public long Id { get; set; }

    public DateTimeOffset FetchedAt { get; set; }

    public long? PropertyId { get; set; }

    public string Data { get; set; } = "{}";
}
