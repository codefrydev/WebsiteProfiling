using Google.Apis.Http;

namespace CoreService.Api.IntegrationsApplication.Google;

public interface IGoogleCredentialFactory
{
    Task<IConfigurableHttpClientInitializer> BuildCredentialsAsync(
        long propertyId,
        CancellationToken cancellationToken = default);
}

public interface IGscSearchAnalyticsClient
{
    Task<IReadOnlyList<string>> ListSitesAsync(
        IConfigurableHttpClientInitializer credential,
        CancellationToken cancellationToken = default);

    (string? ResolvedSite, string? Error) ResolveSiteUrl(string configured, IReadOnlyList<string> sites);

    Task<GscFetchResult> FetchDataAsync(
        IConfigurableHttpClientInitializer credential,
        string siteUrl,
        int dateRangeDays,
        int rowLimit = 1000,
        int maxRows = 25000,
        CancellationToken cancellationToken = default);

    Task<(bool Ok, string Message)> ProbeSiteAsync(
        IConfigurableHttpClientInitializer credential,
        string siteUrl,
        CancellationToken cancellationToken = default);

    Task<(Dictionary<string, object?>? PageData, IReadOnlyList<string> Errors)> FetchPageLiveAsync(
        IConfigurableHttpClientInitializer credential,
        string siteUrl,
        string pageUrl,
        int dateRangeDays,
        CancellationToken cancellationToken = default);

    Task<Dictionary<string, object?>> InspectUrlAsync(
        IConfigurableHttpClientInitializer credential,
        string siteUrl,
        string url,
        CancellationToken cancellationToken = default);
}

public interface IGa4ReportClient
{
    Task<Ga4FetchResult> FetchDataAsync(
        IConfigurableHttpClientInitializer credential,
        string propertyId,
        int dateRangeDays,
        string startUrl,
        CancellationToken cancellationToken = default);

    Task<(IReadOnlyList<Ga4PropertySummary> Properties, string? Error)> ListPropertiesAsync(
        IConfigurableHttpClientInitializer credential,
        CancellationToken cancellationToken = default);

    Task<(bool Ok, string Message)> ProbePropertyAsync(
        IConfigurableHttpClientInitializer credential,
        string propertyId,
        CancellationToken cancellationToken = default);

    Task<(Dictionary<string, object?>? PageData, IReadOnlyList<string> Errors)> FetchPageLiveAsync(
        IConfigurableHttpClientInitializer credential,
        string propertyId,
        string pageUrl,
        string startUrl,
        int dateRangeDays,
        CancellationToken cancellationToken = default);
}
