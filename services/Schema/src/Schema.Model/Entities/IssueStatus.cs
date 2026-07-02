using System;

namespace Schema.Model.Entities;

public partial class IssueStatus
{
    public long Id { get; set; }

    public long PropertyId { get; set; }

    public long? ReportId { get; set; }

    public string IssueFingerprint { get; set; } = null!;

    public string? CategoryId { get; set; }

    public string Message { get; set; } = null!;

    public string Url { get; set; } = null!;

    public string Priority { get; set; } = null!;

    public string Status { get; set; } = null!;

    public string? Assignee { get; set; }

    public string? Note { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }
}
