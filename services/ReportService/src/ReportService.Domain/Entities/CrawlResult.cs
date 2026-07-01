namespace ReportService.Domain.Entities;

/// <summary>
/// Read-only mapping of <c>crawl_results</c> (schema owned by services/Schema). ReportService never migrates this table.
/// </summary>
public sealed class CrawlResult
{
    public long Id { get; set; }

    public long CrawlRunId { get; set; }

    public string Url { get; set; } = "";

    public string? Status { get; set; }

    public string? Title { get; set; }

    public string FetchMethod { get; set; } = "static";

    /// <summary>JSONB page attributes; merge with url/fetch_method for report build.</summary>
    public string Data { get; set; } = "{}";
}
