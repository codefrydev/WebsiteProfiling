using System.Text.Json;
using System.Text.Json.Serialization;
using CoreService.Api.IntegrationsApplication.Repositories;

namespace CoreService.Api.IntegrationsApplication.Google;

public sealed class GoogleFetchService(
    IGoogleCredentialFactory credentials,
    IGscSearchAnalyticsClient gscClient,
    IGa4ReportClient ga4Client,
    PropertyRepository properties,
    GoogleAppSettingsRepository appSettings)
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public async Task<GoogleFetchPayload> FetchAsync(
        GoogleFetchRequest request,
        CancellationToken cancellationToken = default)
    {
        var defaultDays = await appSettings.DefaultDateRangeDaysAsync(cancellationToken);
        var targets = await properties.GetGoogleTargetsAsync(request.PropertyId, defaultDays, cancellationToken)
            ?? throw new InvalidOperationException($"Property id {request.PropertyId} not found.");

        var (gscSiteUrl, ga4PropertyId, resolvedDays) = targets;
        var dateRangeDays = request.DateRangeDays.GetValueOrDefault() > 0
            ? request.DateRangeDays!.Value
            : resolvedDays;

        var errors = new List<string>();
        GscFetchResult? gscData = null;
        Ga4FetchResult? ga4Data = null;

        var cred = await credentials.BuildCredentialsAsync(request.PropertyId, cancellationToken);

        if (!string.IsNullOrWhiteSpace(gscSiteUrl))
        {
            try
            {
                var sites = await gscClient.ListSitesAsync(cred, cancellationToken);
                var (resolvedSite, siteError) = gscClient.ResolveSiteUrl(gscSiteUrl, sites);
                if (resolvedSite is null)
                {
                    errors.Add($"GSC: {siteError}");
                }
                else
                {
                    var maxRows = request.Config?.KeywordGscMaxRows ?? 25000;
                    gscData = await gscClient.FetchDataAsync(
                        cred,
                        resolvedSite,
                        dateRangeDays,
                        maxRows: maxRows,
                        cancellationToken: cancellationToken);
                }
            }
            catch (Exception ex) when (ex is InvalidOperationException or HttpRequestException)
            {
                errors.Add($"GSC: {ex.Message}");
            }
            catch (Exception ex)
            {
                errors.Add($"GSC: {ex.Message}");
            }
        }
        else
        {
            errors.Add("GSC: no site URL configured (set in Integrations > Website in Search Console)");
        }

        if (!string.IsNullOrWhiteSpace(ga4PropertyId))
        {
            try
            {
                ga4Data = await ga4Client.FetchDataAsync(
                    cred,
                    ga4PropertyId,
                    dateRangeDays,
                    request.StartUrl ?? "",
                    cancellationToken);
            }
            catch (Exception ex) when (ex is InvalidOperationException or HttpRequestException)
            {
                errors.Add($"GA4: {ex.Message}");
            }
            catch (Exception ex)
            {
                errors.Add($"GA4: {ex.Message}");
            }
        }
        else
        {
            errors.Add("GA4: no property ID configured (set in Integrations > Analytics property)");
        }

        var dateStart = gscData?.DateStart ?? ga4Data?.DateStart ?? "";
        var dateEnd = gscData?.DateEnd ?? ga4Data?.DateEnd ?? "";

        var urlJoin = new UrlJoinResult
        {
            Matched = 0,
            CrawlOnly = 0,
            GscOnly = 0,
            Ga4Only = 0,
            Lists = new UrlJoinLists(),
            ListsTotal = new UrlJoinListTotals(),
            ListLimit = 200,
        };

        if (request.CrawlUrls is { Count: > 0 } && (gscData is not null || ga4Data is not null))
        {
            var listLimit = request.Config?.GoogleUrlGapListLimit ?? 200;
            urlJoin = UrlJoinBuilder.ComputeUrlJoin(
                request.CrawlUrls,
                gscData?.ByPage.Keys.ToList() ?? [],
                ga4Data?.ByPath.Keys.ToList() ?? [],
                request.StartUrl ?? "",
                gscData?.ByPage.ToDictionary(
                    kv => kv.Key,
                    kv => new JsonElementMetrics
                    {
                        Clicks = kv.Value.Clicks,
                        Impressions = kv.Value.Impressions,
                    }),
                ga4Data?.ByPath.ToDictionary(
                    kv => kv.Key,
                    kv => new JsonElementMetrics { Sessions = kv.Value.Sessions }),
                listLimit);
        }

        return new GoogleFetchPayload
        {
            FetchedAt = DateTimeOffset.UtcNow,
            DateRange = new DateRangePayload { Start = dateStart, End = dateEnd },
            Gsc = gscData?.ToSummaryPayload(),
            GscFull = gscData?.ToFullPayload(),
            Ga4 = ga4Data?.ToSummaryPayload(),
            Ga4Full = ga4Data?.ToFullPayload(),
            UrlJoin = urlJoin,
            Errors = errors,
        };
    }

    public async Task<GooglePropertyListResult> ListPropertiesAsync(
        long propertyId,
        CancellationToken cancellationToken = default)
    {
        var cred = await credentials.BuildCredentialsAsync(propertyId, cancellationToken);
        var gscSites = await gscClient.ListSitesAsync(cred, cancellationToken);
        var (ga4Properties, ga4ListError) = await ga4Client.ListPropertiesAsync(cred, cancellationToken);
        return new GooglePropertyListResult
        {
            GscSites = gscSites,
            Ga4Properties = ga4Properties,
            Ga4ListError = ga4ListError,
        };
    }

    public string SerializePayload(GoogleFetchPayload payload) =>
        JsonSerializer.Serialize(payload, JsonOptions);
}

public sealed class GoogleFetchRequest
{
    public long PropertyId { get; init; }

    public int? DateRangeDays { get; init; }

    public IReadOnlyList<string>? CrawlUrls { get; init; }

    public string? StartUrl { get; init; }

    public GoogleFetchConfig? Config { get; init; }
}

public sealed class GoogleFetchConfig
{
    public int KeywordGscMaxRows { get; init; } = 25000;

    public int GoogleUrlGapListLimit { get; init; } = 200;
}

public sealed class GoogleFetchPayload
{
    [JsonPropertyName("fetched_at")]
    public DateTimeOffset FetchedAt { get; init; }

    [JsonPropertyName("date_range")]
    public DateRangePayload DateRange { get; init; } = new();

    [JsonPropertyName("gsc")]
    public object? Gsc { get; init; }

    [JsonPropertyName("gsc_full")]
    public object? GscFull { get; init; }

    [JsonPropertyName("ga4")]
    public object? Ga4 { get; init; }

    [JsonPropertyName("ga4_full")]
    public object? Ga4Full { get; init; }

    [JsonPropertyName("url_join")]
    public UrlJoinResult UrlJoin { get; init; } = new();

    [JsonPropertyName("errors")]
    public IReadOnlyList<string> Errors { get; init; } = [];
}

public sealed class DateRangePayload
{
    [JsonPropertyName("start")]
    public string Start { get; init; } = "";

    [JsonPropertyName("end")]
    public string End { get; init; } = "";
}

public sealed class GooglePropertyListResult
{
    [JsonPropertyName("gscSites")]
    public IReadOnlyList<string> GscSites { get; init; } = [];

    [JsonPropertyName("ga4Properties")]
    public IReadOnlyList<Ga4PropertySummary> Ga4Properties { get; init; } = [];

    [JsonPropertyName("ga4ListError")]
    public string? Ga4ListError { get; init; }
}
