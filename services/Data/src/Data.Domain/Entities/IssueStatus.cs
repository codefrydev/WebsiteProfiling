namespace Data.Domain.Entities;

/// <summary>
/// Mapping of the Alembic-owned <c>issue_status</c> table (issue workflow on the task board).
/// </summary>
public sealed class IssueStatus
{
    public long Id { get; set; }

    public long PropertyId { get; set; }

    public long? ReportId { get; set; }

    public string IssueFingerprint { get; set; } = string.Empty;

    public string? CategoryId { get; set; }

    public string Message { get; set; } = string.Empty;

    public string Url { get; set; } = string.Empty;

    public string Priority { get; set; } = "Medium";

    public string Status { get; set; } = "open";

    public string? Assignee { get; set; }

    public string? Note { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }
}
