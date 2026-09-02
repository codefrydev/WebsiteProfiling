namespace CoreService.Api.Domain.Data.Entities;

/// <summary>
/// Read-only mapping of the existing <c>report_payload</c> table (schema owned by services/Schema).
/// The Data service never writes or migrates this table.
/// </summary>
public sealed class ReportPayload
{
    public long Id { get; set; }

    /// <summary><c>generated_at TIMESTAMPTZ</c> → mapped to <see cref="DateTimeOffset"/>.</summary>
    public DateTimeOffset GeneratedAt { get; set; }

    public string? SiteName { get; set; }

    public string? CanonicalDomain { get; set; }

    /// <summary><c>data JSONB</c> mapped as raw JSON text; parsed with System.Text.Json where needed.</summary>
    public string Data { get; set; } = "{}";
}
