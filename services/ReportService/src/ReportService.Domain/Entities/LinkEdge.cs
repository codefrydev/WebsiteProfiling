namespace ReportService.Domain.Entities;

public sealed class LinkEdge
{
    public long CrawlRunId { get; set; }

    public string FromUrl { get; set; } = "";

    public string ToUrl { get; set; } = "";

    public string AnchorText { get; set; } = "";

    public string Rel { get; set; } = "";

    public bool IsNofollow { get; set; }

    public bool IsSponsored { get; set; }

    public bool IsUgc { get; set; }

    public string LinkType { get; set; } = "internal";

    public string Position { get; set; } = "content";
}
