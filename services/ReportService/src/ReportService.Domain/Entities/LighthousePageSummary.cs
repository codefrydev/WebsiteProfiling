namespace ReportService.Domain.Entities;

/// <summary>
/// Read-only mapping of Alembic-owned <c>lighthouse_page_summaries</c>.
/// </summary>
public sealed class LighthousePageSummary
{
    public string Url { get; set; } = "";

    public string? CreatedAt { get; set; }

    public string Data { get; set; } = "{}";
}
