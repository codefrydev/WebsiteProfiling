using System.Text.Json.Serialization;

namespace WebsiteProfiling.Contracts.Crawl;

/// <summary>
/// One crawl result row (records-orient from <c>crawl_results</c> JSONB merged with url/fetch_method).
/// </summary>
public sealed record CrawlRow
{
    [JsonPropertyName("url")]
    public string Url { get; init; } = "";

    [JsonPropertyName("fetch_method")]
    public string FetchMethod { get; init; } = "";

    [JsonPropertyName("status")]
    public string Status { get; init; } = "";

    [JsonPropertyName("title")]
    public string Title { get; init; } = "";

    [JsonPropertyName("has_schema")]
    public bool HasSchema { get; init; }

    [JsonPropertyName("schema_types")]
    public IReadOnlyList<string> SchemaTypes { get; init; } = [];

    /// <summary>Raw page_analysis object or double-encoded JSON string source.</summary>
    [JsonPropertyName("page_analysis")]
    public string? PageAnalysisJson { get; init; }

    /// <summary>Additional crawl data fields not modeled explicitly.</summary>
    [JsonExtensionData]
    public Dictionary<string, System.Text.Json.JsonElement>? ExtensionData { get; init; }
}
