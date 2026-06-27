using System.Text.Json.Serialization;

namespace WebsiteProfiling.Contracts.Integrations;

public sealed record PageMetricsRow
{
    [JsonPropertyName("url")]
    public string Url { get; init; } = "";

    [JsonPropertyName("path")]
    public string Path { get; init; } = "";

    [JsonPropertyName("clicks")]
    public int Clicks { get; init; }

    [JsonPropertyName("impressions")]
    public int Impressions { get; init; }

    [JsonPropertyName("ctr")]
    public double Ctr { get; init; }

    [JsonPropertyName("position")]
    public double Position { get; init; }

    [JsonPropertyName("sessions")]
    public int Sessions { get; init; }

    [JsonPropertyName("active_users")]
    public int ActiveUsers { get; init; }

    [JsonPropertyName("screen_page_views")]
    public int ScreenPageViews { get; init; }
}

public sealed record PageLookupResult
{
    [JsonPropertyName("url")]
    public string Url { get; init; } = "";

    [JsonPropertyName("found")]
    public bool Found { get; init; }

    [JsonPropertyName("gsc")]
    public PageMetricsRow? Gsc { get; init; }

    [JsonPropertyName("ga4")]
    public PageMetricsRow? Ga4 { get; init; }

    [JsonPropertyName("note")]
    public string? Note { get; init; }
}

public sealed record BingBacklinksSummary
{
    [JsonPropertyName("total_backlinks")]
    public int TotalBacklinks { get; init; }

    [JsonPropertyName("referring_domains")]
    public int ReferringDomains { get; init; }

    [JsonPropertyName("fetched_at")]
    public string? FetchedAt { get; init; }
}
