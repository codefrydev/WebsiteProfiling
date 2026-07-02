using System;

namespace Schema.Model.Entities;

public partial class Node
{
    public long CrawlRunId { get; set; }

    public string Url { get; set; } = null!;

    public int Count { get; set; }
}
