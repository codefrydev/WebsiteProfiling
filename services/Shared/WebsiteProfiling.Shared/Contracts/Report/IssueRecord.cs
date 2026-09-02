using System.Text.Json.Serialization;

namespace WebsiteProfiling.Contracts.Report;

public sealed record IssueRecord
{
    [JsonPropertyName("category")]
    public string Category { get; init; } = "";

    [JsonPropertyName("priority")]
    public string Priority { get; init; } = "";

    [JsonPropertyName("message")]
    public string Message { get; init; } = "";

    [JsonPropertyName("headline")]
    public string Headline { get; init; } = "";

    [JsonPropertyName("url")]
    public string Url { get; init; } = "";

    [JsonPropertyName("url_path")]
    public string UrlPath { get; init; } = "";

    [JsonPropertyName("recommendation")]
    public string Recommendation { get; init; } = "";

    [JsonPropertyName("gsc_clicks")]
    public int? GscClicks { get; init; }

    [JsonPropertyName("gsc_impressions")]
    public int? GscImpressions { get; init; }

    [JsonPropertyName("impact_score")]
    public int? ImpactScore { get; init; }
}
