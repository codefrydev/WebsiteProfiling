namespace AiService.Domain.Entities;

/// <summary>Read/write mapping of the Alembic-owned <c>report_payload</c> table.</summary>
public sealed class ReportPayload
{
    public long Id { get; set; }

    public DateTimeOffset GeneratedAt { get; set; }

    public string? SiteName { get; set; }

    public string? CanonicalDomain { get; set; }

    public string Data { get; set; } = "{}";
}
