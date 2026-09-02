using WebsiteProfiling.Contracts.Integrations;

namespace CoreService.Api.IntegrationsApplication.Google;

public sealed record BingBacklinksFetchResult
{
    public bool Ok { get; init; }

    public string? Error { get; init; }

    public string SiteUrl { get; init; } = "";

    public int TotalBacklinks { get; init; }

    public int ReferringDomains { get; init; }

    public int LinkedPageCount { get; init; }

    public BingBacklinksSummary ToSummary()
        => new()
        {
            TotalBacklinks = TotalBacklinks,
            ReferringDomains = ReferringDomains,
        };
}
