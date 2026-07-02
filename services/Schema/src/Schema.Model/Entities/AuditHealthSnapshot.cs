using System;

namespace Schema.Model.Entities;

public partial class AuditHealthSnapshot
{
    public long Id { get; set; }

    public long? PropertyId { get; set; }

    public long ReportId { get; set; }

    public string? CanonicalDomain { get; set; }

    public int? HealthScore { get; set; }

    public string CategoryScores { get; set; } = null!;

    public string IssueCounts { get; set; } = null!;

    public DateTimeOffset GeneratedAt { get; set; }
}
