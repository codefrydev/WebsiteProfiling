using System;

namespace Schema.Model.Entities;

public partial class CrawlPageHtml
{
    public long CrawlRunId { get; set; }

    public string Url { get; set; } = null!;

    public string Html { get; set; } = null!;

    public string? Status { get; set; }

    public string? ContentType { get; set; }

    public string FetchMethod { get; set; } = null!;

    public int ByteLength { get; set; }

    public DateTimeOffset CapturedAt { get; set; }
}
