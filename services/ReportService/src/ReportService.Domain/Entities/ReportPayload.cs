namespace ReportService.Domain.Entities;

/// <summary>
/// Mapping of the existing <c>report_payload</c> table (schema owned by services/Schema).
/// </summary>
public sealed class ReportPayload
{
    public long Id { get; set; }

    public DateTimeOffset GeneratedAt { get; set; }

    public string? SiteName { get; set; }

    public string? CanonicalDomain { get; set; }

    public string Data { get; set; } = "{}";
}
