using WebsiteProfiling.Contracts.Google;

namespace CoreService.Api.IntegrationsApplication.Google;

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
