using System;

namespace Schema.Model.Entities;

public partial class LinkEdge
{
    public long CrawlRunId { get; set; }

    public string FromUrl { get; set; } = null!;

    public string ToUrl { get; set; } = null!;

    public string AnchorText { get; set; } = null!;

    public string Rel { get; set; } = null!;

    public bool IsNofollow { get; set; }

    public bool IsSponsored { get; set; }

    public bool IsUgc { get; set; }

    public string LinkType { get; set; } = null!;

    public string Position { get; set; } = null!;
}
