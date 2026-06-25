namespace IntegrationsService.Domain.Entities;

/// <summary>GSC/GA4 snapshot row in <c>google_data</c>.</summary>
public sealed class GoogleData
{
    public long Id { get; set; }

    public DateTimeOffset FetchedAt { get; set; }

    public long? PropertyId { get; set; }

    public string Data { get; set; } = "{}";
}
