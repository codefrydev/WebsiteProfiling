using System;

namespace Schema.Model.Entities;

public partial class CrawlPageMarkdown
{
    public long CrawlRunId { get; set; }

    public string Url { get; set; } = null!;

    public long? PropertyId { get; set; }

    public string? Title { get; set; }

    public string Markdown { get; set; } = null!;

    public int WordCount { get; set; }

    public string Strategy { get; set; } = null!;

    public int SourceByteLength { get; set; }

    public DateTimeOffset ExtractedAt { get; set; }
}
