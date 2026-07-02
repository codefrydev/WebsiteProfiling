using System;

namespace Schema.Model.Entities;

public partial class Edge
{
    public long CrawlRunId { get; set; }

    public string FromUrl { get; set; } = null!;

    public string ToUrl { get; set; } = null!;
}
