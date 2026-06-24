namespace Data.Domain.Entities;

/// <summary>
/// Read-only mapping of the existing <c>crawl_results</c> table (owned by Alembic migrations).
/// Columns <c>status</c> and <c>title</c> were added in migration 002; <c>data</c> JSONB holds
/// all raw page attributes. The Data service never writes or migrates this table.
/// </summary>
public sealed class CrawlResult
{
    public long Id { get; set; }
    public long CrawlRunId { get; set; }

    /// <summary><c>url TEXT NOT NULL</c></summary>
    public string Url { get; set; } = "";

    /// <summary><c>status TEXT</c> — HTTP status string, e.g. "200", "404" (added in migration 002).</summary>
    public string? Status { get; set; }

    /// <summary><c>title TEXT</c> — page title extracted column (added in migration 002).</summary>
    public string? Title { get; set; }

    /// <summary><c>data JSONB NOT NULL</c> — raw page attributes; parse with System.Text.Json.</summary>
    public string Data { get; set; } = "{}";
}
