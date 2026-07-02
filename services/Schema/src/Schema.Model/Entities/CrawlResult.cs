using System;

namespace Schema.Model.Entities;

public partial class CrawlResult
{
    public long Id { get; set; }

    public long CrawlRunId { get; set; }

    public string Url { get; set; } = null!;

    public string Data { get; set; } = null!;

    public string? Status { get; set; }

    public string? Title { get; set; }

    public string? FetchMethod { get; set; }
}
