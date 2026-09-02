using System.Text.Json.Serialization;
using WebsiteProfiling.Contracts.Google;

namespace AiService.Api.Tools.Models.Insight;

public sealed record BlendedTableArgs
{
    [JsonPropertyName("limit")]
    public int? Limit { get; init; }

    [JsonPropertyName("min_impressions")]
    public int? MinImpressions { get; init; }
}

public sealed record LandingPageBlendedRow
{
    [JsonPropertyName("url")]
    public string Url { get; init; } = "";

    [JsonPropertyName("gsc_clicks")]
    public long GscClicks { get; init; }

    [JsonPropertyName("gsc_impressions")]
    public long GscImpressions { get; init; }

    [JsonPropertyName("gsc_position")]
    public double GscPosition { get; init; }

    [JsonPropertyName("gsc_ctr")]
    public double GscCtr { get; init; }

    [JsonPropertyName("ga4_sessions")]
    public long Ga4Sessions { get; init; }

    [JsonPropertyName("ga4_engagement_rate")]
    public double? Ga4EngagementRate { get; init; }

    [JsonPropertyName("quadrant")]
    public string Quadrant { get; init; } = "low_priority";
}

public sealed record BlendedTableResult
{
    [JsonPropertyName("rows")]
    public IReadOnlyList<LandingPageBlendedRow> Rows { get; init; } = [];

    [JsonPropertyName("total")]
    public int Total { get; init; }

    [JsonPropertyName("truncated")]
    public bool Truncated { get; init; }

    [JsonPropertyName("provenance")]
    public ProvenanceBlock? Provenance { get; init; }

    [JsonPropertyName("insights")]
    public IReadOnlyList<string> Insights { get; init; } = [];

    [JsonPropertyName("error")]
    public string? Error { get; init; }

    [JsonPropertyName("missing")]
    public bool? Missing { get; init; }
}

public sealed record OpportunityMatrixResult
{
    [JsonPropertyName("quadrants")]
    public Dictionary<string, IReadOnlyList<LandingPageBlendedRow>> Quadrants { get; init; } = new(StringComparer.Ordinal);

    [JsonPropertyName("counts")]
    public Dictionary<string, int> Counts { get; init; } = new(StringComparer.Ordinal);

    [JsonPropertyName("provenance")]
    public ProvenanceBlock? Provenance { get; init; }

    [JsonPropertyName("insights")]
    public IReadOnlyList<string> Insights { get; init; } = [];
}

public sealed record TrafficHealthResult
{
    [JsonPropertyName("gsc_clicks")]
    public double GscClicks { get; init; }

    [JsonPropertyName("ga4_sessions")]
    public double Ga4Sessions { get; init; }

    [JsonPropertyName("ratio")]
    public double? Ratio { get; init; }

    [JsonPropertyName("diagnosis")]
    public string Diagnosis { get; init; } = "";

    [JsonPropertyName("note")]
    public string Note { get; init; } = "";

    [JsonPropertyName("provenance")]
    public ProvenanceBlock? Provenance { get; init; }

    [JsonPropertyName("insights")]
    public IReadOnlyList<string> Insights { get; init; } = [];

    [JsonPropertyName("error")]
    public string? Error { get; init; }

    [JsonPropertyName("missing")]
    public bool? Missing { get; init; }
}
