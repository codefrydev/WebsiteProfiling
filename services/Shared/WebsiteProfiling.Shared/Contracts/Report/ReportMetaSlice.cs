using System.Text.Json.Serialization;

namespace WebsiteProfiling.Contracts.Report;

public sealed record ReportMetaSlice
{
    [JsonPropertyName("crawl_run_id")]
    public int? CrawlRunId { get; init; }

    [JsonPropertyName("generated_at")]
    public string? GeneratedAt { get; init; }

    [JsonPropertyName("data_sources")]
    public IReadOnlyList<string> DataSources { get; init; } = [];

    [JsonPropertyName("site_name")]
    public string? SiteName { get; init; }

    [JsonPropertyName("report_generated_at")]
    public string? ReportGeneratedAt { get; init; }
}
