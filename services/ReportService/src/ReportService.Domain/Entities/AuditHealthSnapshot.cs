namespace ReportService.Domain.Entities;

public sealed class AuditHealthSnapshot
{
    public long Id { get; set; }

    public long? PropertyId { get; set; }

    public long ReportId { get; set; }

    public string? CanonicalDomain { get; set; }

    public int? HealthScore { get; set; }

    public string CategoryScores { get; set; } = "{}";

    public string IssueCounts { get; set; } = "{}";

    public DateTimeOffset GeneratedAt { get; set; }
}
