namespace CoreService.Api.Domain.Report.Entities;

/// <summary>Row in the plot/crawl <c>edges</c> table (internal link pairs).</summary>
public sealed class CrawlGraphEdge
{
    public long CrawlRunId { get; set; }

    public string FromUrl { get; set; } = "";

    public string ToUrl { get; set; } = "";
}
