using System.Text.Json.Serialization;

namespace IntegrationsService.Application.Google;

public sealed class GscFetchResult
{
    public string SiteUrl { get; init; } = "";

    public GscSummary Summary { get; init; } = new();

    public IReadOnlyList<GscQueryRecord> TopQueries { get; init; } = [];

    public IReadOnlyList<GscPageRecord> TopPages { get; init; } = [];

    public Dictionary<string, GscPageDetail> ByPage { get; init; } = new(StringComparer.Ordinal);

    public IReadOnlyList<GscDailyRecord> Daily { get; init; } = [];

    public string DateStart { get; init; } = "";

    public string DateEnd { get; init; } = "";

    public object ToSummaryPayload() => new
    {
        site_url = SiteUrl,
        summary = Summary,
        top_queries = TopQueries.Take(100),
        top_pages = TopPages.Take(100),
        daily = Daily,
    };

    public object ToFullPayload() => new
    {
        site_url = SiteUrl,
        summary = Summary,
        top_queries = TopQueries,
        top_pages = TopPages,
        by_page = ByPage,
        daily = Daily,
        date_start = DateStart,
        date_end = DateEnd,
    };
}

public sealed class GscSummary
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

public sealed class GscQueryRecord
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

public sealed class GscPageRecord
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

public sealed class GscPageDetail
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

public sealed class GscDailyRecord
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

public sealed class Ga4FetchResult
{
    public string PropertyId { get; init; } = "";

    public Ga4Summary Summary { get; init; } = new();

    public IReadOnlyList<Ga4PageRecord> TopPages { get; init; } = [];

    public Dictionary<string, Ga4PageRecord> ByPath { get; init; } = new(StringComparer.Ordinal);

    public IReadOnlyList<Ga4DailyRecord> Daily { get; init; } = [];

    public IReadOnlyList<Ga4ChannelRecord> ByChannel { get; init; } = [];

    public IReadOnlyList<Ga4DeviceRecord> ByDevice { get; init; } = [];

    public string DateStart { get; init; } = "";

    public string DateEnd { get; init; } = "";

    public object ToSummaryPayload() => new
    {
        property_id = PropertyId,
        summary = Summary,
        top_pages = TopPages.Take(100),
        daily = Daily,
        by_channel = ByChannel,
        by_device = ByDevice,
    };

    public object ToFullPayload() => new
    {
        property_id = PropertyId,
        summary = Summary,
        top_pages = TopPages,
        by_path = ByPath,
        daily = Daily,
        by_channel = ByChannel,
        by_device = ByDevice,
        date_start = DateStart,
        date_end = DateEnd,
    };
}

public sealed class Ga4Summary
{
    [JsonPropertyName("sessions")]
    public int Sessions { get; init; }

    [JsonPropertyName("activeUsers")]
    public int ActiveUsers { get; init; }

    [JsonPropertyName("screenPageViews")]
    public int ScreenPageViews { get; init; }
}

public sealed class Ga4PageRecord
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

public sealed class Ga4DailyRecord
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

public sealed class Ga4ChannelRecord
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

public sealed class Ga4DeviceRecord
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
