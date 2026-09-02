using System.Text.Json.Serialization;

namespace WebsiteProfiling.Contracts.Google;

public sealed record GscSummary
{
    [JsonPropertyName("clicks")]
    public int Clicks { get; init; }

    [JsonPropertyName("impressions")]
    public int Impressions { get; init; }

    [JsonPropertyName("ctr")]
    public double Ctr { get; init; }

    [JsonPropertyName("position")]
    public double Position { get; init; }
}

public sealed record GscQueryRecord
{
    [JsonPropertyName("query")]
    public string Query { get; init; } = "";

    [JsonPropertyName("clicks")]
    public int Clicks { get; init; }

    [JsonPropertyName("impressions")]
    public int Impressions { get; init; }

    [JsonPropertyName("ctr")]
    public double Ctr { get; init; }

    [JsonPropertyName("position")]
    public double Position { get; init; }
}

public sealed record GscPageRecord
{
    [JsonPropertyName("page")]
    public string Page { get; init; } = "";

    [JsonPropertyName("clicks")]
    public int Clicks { get; init; }

    [JsonPropertyName("impressions")]
    public int Impressions { get; init; }

    [JsonPropertyName("ctr")]
    public double Ctr { get; init; }

    [JsonPropertyName("position")]
    public double Position { get; init; }
}

public sealed record GscPageDetail
{
    [JsonPropertyName("page")]
    public string Page { get; init; } = "";

    [JsonPropertyName("clicks")]
    public int Clicks { get; init; }

    [JsonPropertyName("impressions")]
    public int Impressions { get; init; }

    [JsonPropertyName("ctr")]
    public double Ctr { get; init; }

    [JsonPropertyName("position")]
    public double Position { get; init; }

    [JsonPropertyName("queries")]
    public List<GscQueryRecord> Queries { get; init; } = [];
}

public sealed record GscDailyRecord
{
    [JsonPropertyName("date")]
    public string Date { get; init; } = "";

    [JsonPropertyName("clicks")]
    public int Clicks { get; init; }

    [JsonPropertyName("impressions")]
    public int Impressions { get; init; }

    [JsonPropertyName("ctr")]
    public double Ctr { get; init; }

    [JsonPropertyName("position")]
    public double Position { get; init; }
}

public sealed record Ga4Summary
{
    [JsonPropertyName("sessions")]
    public int Sessions { get; init; }

    [JsonPropertyName("activeUsers")]
    public int ActiveUsers { get; init; }

    [JsonPropertyName("screenPageViews")]
    public int ScreenPageViews { get; init; }
}

public sealed record Ga4PageRecord
{
    [JsonPropertyName("path")]
    public string Path { get; init; } = "";

    [JsonPropertyName("full_url")]
    public string FullUrl { get; init; } = "";

    [JsonPropertyName("sessions")]
    public int Sessions { get; init; }

    [JsonPropertyName("activeUsers")]
    public int ActiveUsers { get; init; }

    [JsonPropertyName("screenPageViews")]
    public int ScreenPageViews { get; init; }

    [JsonPropertyName("engagementRate")]
    public double EngagementRate { get; init; }

    [JsonPropertyName("avgSessionDuration")]
    public double AvgSessionDuration { get; init; }
}

public sealed record Ga4DailyRecord
{
    [JsonPropertyName("date")]
    public string Date { get; init; } = "";

    [JsonPropertyName("sessions")]
    public int Sessions { get; init; }

    [JsonPropertyName("activeUsers")]
    public int ActiveUsers { get; init; }

    [JsonPropertyName("screenPageViews")]
    public int ScreenPageViews { get; init; }
}

public sealed record Ga4ChannelRecord
{
    [JsonPropertyName("channel")]
    public string Channel { get; init; } = "";

    [JsonPropertyName("sessions")]
    public int Sessions { get; init; }

    [JsonPropertyName("activeUsers")]
    public int ActiveUsers { get; init; }

    [JsonPropertyName("screenPageViews")]
    public int ScreenPageViews { get; init; }
}

public sealed record Ga4DeviceRecord
{
    [JsonPropertyName("device")]
    public string Device { get; init; } = "";

    [JsonPropertyName("sessions")]
    public int Sessions { get; init; }

    [JsonPropertyName("activeUsers")]
    public int ActiveUsers { get; init; }

    [JsonPropertyName("screenPageViews")]
    public int ScreenPageViews { get; init; }
}

/// <summary>Subset of google snapshot used by insight and portfolio tools.</summary>
public sealed record GoogleSlice
{
    [JsonPropertyName("gsc")]
    public GscBlob? Gsc { get; init; }

    [JsonPropertyName("ga4")]
    public Ga4Blob? Ga4 { get; init; }

    [JsonPropertyName("fetched_at")]
    public string? FetchedAt { get; init; }

    public sealed record GscBlob
    {
        [JsonPropertyName("summary")]
        public GscSummary? Summary { get; init; }

        [JsonPropertyName("by_page")]
        public Dictionary<string, GscPageRecord> ByPage { get; init; } = new(StringComparer.Ordinal);
    }

    public sealed record Ga4Blob
    {
        [JsonPropertyName("summary")]
        public Ga4Summary? Summary { get; init; }

        [JsonPropertyName("by_path")]
        public Dictionary<string, Ga4PageRecord> ByPath { get; init; } = new(StringComparer.Ordinal);
    }
}

public sealed record ProvenanceBlock
{
    [JsonPropertyName("sources")]
    public IReadOnlyList<string> Sources { get; init; } = [];

    [JsonPropertyName("fetched_at")]
    public string? FetchedAt { get; init; }

    [JsonPropertyName("confidence")]
    public string Confidence { get; init; } = "high";
}
