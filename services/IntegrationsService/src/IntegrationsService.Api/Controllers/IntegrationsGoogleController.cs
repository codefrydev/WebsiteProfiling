using System.Text.Json;
using IntegrationsService.Application.Google;
using IntegrationsService.Application.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace IntegrationsService.Api.Controllers;

[ApiController]
[Route("api/integrations/google")]
[Tags("Integrations Google")]
public sealed class IntegrationsGoogleController(
    GoogleAppSettingsRepository appSettings,
    GoogleDataReadRepository googleData,
    PropertyRepository properties,
    GoogleOAuthService oauth,
    PageLiveService pageLive,
    PageCompareService pageCompare,
    PageGoogleSnapshotRepository pageSnapshots,
    KeywordDataRepository keywordData,
    KeywordExpandPlannerService keywordExpandPlanner,
    IGoogleCredentialFactory credentials,
    IGscSearchAnalyticsClient gscClient) : ControllerBase
{
    private static readonly Dictionary<string, object?> EmptyPageData = new()
    {
        ["source"] = "snapshot",
        ["snapshotId"] = null,
        ["gsc"] = null,
        ["ga4"] = null,
        ["coverage"] = new { inCrawl = false, inGsc = false, inGa4 = false },
        ["siteBenchmarks"] = new { gsc = (object?)null, ga4 = (object?)null },
        ["dateRange"] = new { },
        ["fetchedAt"] = (string?)null,
    };

    [HttpGet("auth")]
    public async Task<IActionResult> AuthStart(
        [FromQuery] long? propertyId,
        [FromQuery] string? startUrl,
        [FromQuery] string? returnTo,
        CancellationToken cancellationToken)
    {
        try
        {
            var url = await oauth.OAuthStartAsync(propertyId, startUrl, returnTo, cancellationToken);
            return Redirect(url);
        }
        catch (GoogleOAuthException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpGet("callback")]
    public async Task<IActionResult> AuthCallback(
        [FromQuery] string? code,
        [FromQuery] string? state,
        [FromQuery] string? error,
        CancellationToken cancellationToken)
    {
        var url = await oauth.OAuthCallbackAsync(code, state, error, cancellationToken);
        return Redirect(url);
    }

    [HttpGet("status")]
    public async Task<IActionResult> AppStatus(CancellationToken cancellationToken)
    {
        var cfg = await appSettings.ReadAsync(cancellationToken);
        var hasClientId = !string.IsNullOrWhiteSpace(cfg.ClientId);
        var hasClientSecret = !string.IsNullOrWhiteSpace(cfg.ClientSecret);
        var hasServiceAccount = await appSettings.HasServiceAccountAsync(cancellationToken);
        string? serviceAccountEmail = null;
        if (hasServiceAccount)
        {
            using var sa = await appSettings.ReadServiceAccountJsonAsync(cancellationToken);
            if (sa?.RootElement.TryGetProperty("client_email", out var email) == true)
            {
                serviceAccountEmail = email.GetString();
            }
        }

        return Ok(new
        {
            hasClientId,
            hasClientSecret,
            hasOAuthApp = hasClientId && hasClientSecret,
            hasServiceAccount,
            serviceAccountEmail,
            dateRangeDays = cfg.DefaultDateRangeDays > 0 ? cfg.DefaultDateRangeDays : 28,
            hasDeveloperToken = !string.IsNullOrWhiteSpace(cfg.DeveloperToken),
            hasLoginCustomerId = !string.IsNullOrWhiteSpace(cfg.LoginCustomerId),
            lastFetchedAt = await googleData.ReadLastFetchedAtGlobalAsync(cancellationToken),
        });
    }

    [HttpGet("credentials")]
    public async Task<IActionResult> AppCredentials(CancellationToken cancellationToken)
    {
        var cfg = await appSettings.ReadAsync(cancellationToken);
        using var sa = await appSettings.ReadServiceAccountJsonAsync(cancellationToken);
        object? serviceAccount = null;
        if (sa is not null)
        {
            serviceAccount = JsonSerializer.Deserialize<object>(sa.RootElement.GetRawText());
        }

        return Ok(new
        {
            clientId = (cfg.ClientId ?? "").Trim(),
            clientSecret = (cfg.ClientSecret ?? "").Trim(),
            serviceAccount,
            dateRangeDays = cfg.DefaultDateRangeDays > 0 ? cfg.DefaultDateRangeDays : 28,
            developerToken = (cfg.DeveloperToken ?? "").Trim(),
            loginCustomerId = (cfg.LoginCustomerId ?? "").Trim(),
        });
    }

    [HttpPost("keywords/expand")]
    public async Task<IActionResult> KeywordsExpand(
        [FromBody] KeywordExpandBody body,
        CancellationToken cancellationToken)
    {
        var (status, payload) = await keywordExpandPlanner.ExpandAsync(
            body.Keyword ?? "",
            body.PropertyId,
            cancellationToken);
        return StatusCode(status, payload ?? new { });
    }

    [HttpPost("keywords/planner")]
    public async Task<IActionResult> KeywordsPlanner(
        [FromBody] KeywordPlannerBody body,
        CancellationToken cancellationToken)
    {
        var (status, payload) = await keywordExpandPlanner.PlannerAsync(
            body.Keywords ?? [],
            cancellationToken);
        return StatusCode(status, payload ?? new { });
    }

    [HttpGet("url-inspection")]
    public async Task<IActionResult> UrlInspection(
        [FromQuery] string url,
        [FromQuery] string? propertyId,
        [FromQuery] string? domain,
        CancellationToken cancellationToken)
    {
        var pageUrl = (url ?? "").Trim();
        if (string.IsNullOrEmpty(pageUrl))
        {
            return BadRequest(new { error = "url parameter is required" });
        }

        var resolvedPropertyId = await properties.ResolvePropertyIdForPageAsync(
            pageUrl, propertyId, domain, cancellationToken);
        if (resolvedPropertyId is null)
        {
            return BadRequest(new { error = "propertyId or domain required" });
        }

        var prop = await properties.GetByIdAsync(resolvedPropertyId.Value, cancellationToken);
        if (prop is null)
        {
            return NotFound(new { error = "Property not found" });
        }

        var gscSiteUrl = (prop.GscSiteUrl ?? "").Trim();
        if (string.IsNullOrEmpty(gscSiteUrl))
        {
            return BadRequest(new { error = "GSC site URL is not configured for this property." });
        }

        try
        {
            var cred = await credentials.BuildCredentialsAsync(resolvedPropertyId.Value, cancellationToken);
            var result = await gscClient.InspectUrlAsync(cred, gscSiteUrl, pageUrl, cancellationToken);
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpGet("page-data")]
    public async Task<IActionResult> PageData(
        [FromQuery] string url,
        [FromQuery] long? googleSnapshotId,
        [FromQuery] string? propertyId,
        [FromQuery] string? domain,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(url))
        {
            return BadRequest(new { error = "url parameter required" });
        }

        var resolvedPropertyId = await properties.ResolvePropertyIdForPageAsync(
            url, propertyId, domain, cancellationToken);
        if (resolvedPropertyId is null)
        {
            return Ok(EmptyPageData);
        }

        var snap = await googleData.ReadSnapshotRowAsync(
            resolvedPropertyId.Value,
            googleSnapshotId,
            cancellationToken);
        if (snap is null)
        {
            return Ok(EmptyPageData);
        }

        using var doc = snap.ParseData();
        var slice = PageLookupService.SliceFromGoogleRow(doc.RootElement, url);
        return Ok(new Dictionary<string, object?>(EmptyPageData)
        {
            ["source"] = slice.Source,
            ["snapshotId"] = snap.Id,
            ["gsc"] = slice.Gsc,
            ["ga4"] = slice.Ga4,
            ["coverage"] = slice.Coverage,
            ["siteBenchmarks"] = slice.SiteBenchmarks,
            ["dateRange"] = slice.DateRange,
            ["fetchedAt"] = snap.FetchedAt ?? slice.FetchedAt,
        });
    }

    [HttpGet("page-data/history")]
    public async Task<IActionResult> PageDataHistory(
        [FromQuery] string url,
        [FromQuery] string? propertyId,
        [FromQuery] string? domain,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(url))
        {
            return BadRequest(new { error = "url parameter required" });
        }

        var resolvedPropertyId = await properties.ResolvePropertyIdForPageAsync(
            url, propertyId, domain, cancellationToken);
        if (resolvedPropertyId is null)
        {
            return Ok(new { url, history = Array.Empty<object>() });
        }

        var history = new List<object>();
        foreach (var snap in await googleData.ListSnapshotRowsAsync(resolvedPropertyId.Value, 10, cancellationToken))
        {
            using var doc = snap.ParseData();
            var slice = PageLookupService.SliceFromGoogleRow(doc.RootElement, url);
            if (slice.Gsc is null && slice.Ga4 is null)
            {
                continue;
            }

            var summary = PageLookupService.SummaryFromSlice(slice.Gsc, slice.Ga4);
            history.Add(new
            {
                id = snap.Id,
                fetchedAt = snap.FetchedAt,
                type = "snapshot",
                gsc = summary.GetValueOrDefault("gsc"),
                ga4 = summary.GetValueOrDefault("ga4"),
            });
        }

        return Ok(new { url, history });
    }

    [HttpPost("page-live")]
    public async Task<IActionResult> PageLive(
        [FromBody] PageLiveRequestBody body,
        CancellationToken cancellationToken)
    {
        var pageUrl = (body.Url ?? "").Trim();
        if (string.IsNullOrEmpty(pageUrl))
        {
            return BadRequest(new { error = "url is required" });
        }

        long? propertyId = body.PropertyId;
        if (propertyId is null or <= 0 && !string.IsNullOrWhiteSpace(body.Domain))
        {
            propertyId = await properties.GetPropertyIdByDomainAsync(body.Domain!, cancellationToken);
        }

        if (propertyId is null or <= 0)
        {
            propertyId = await properties.ResolvePropertyIdForPageAsync(
                pageUrl,
                body.PropertyId?.ToString(),
                body.Domain,
                cancellationToken);
        }

        try
        {
            var data = await pageLive.FetchPageLiveAsync(
                pageUrl,
                propertyId,
                body.Persist ?? true,
                cancellationToken);

            if (data.GetValueOrDefault("ok") is false
                && data.GetValueOrDefault("gsc") is null
                && data.GetValueOrDefault("ga4") is null)
            {
                return StatusCode(500, new
                {
                    error = (data.GetValueOrDefault("errors") as IEnumerable<object>)?.FirstOrDefault()?.ToString()
                        ?? "Live fetch failed",
                });
            }

            var response = new Dictionary<string, object?>(data);
            if (!response.ContainsKey("ok"))
            {
                response["ok"] = true;
            }

            if (response.GetValueOrDefault("fetchedAt") is null)
            {
                response["fetchedAt"] = DateTimeOffset.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");
            }

            return Ok(response);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message });
        }
    }

    [HttpGet("page-live/history")]
    public async Task<IActionResult> PageLiveHistory(
        [FromQuery] string url,
        [FromQuery] int limit = 15,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(url))
        {
            return BadRequest(new { error = "url parameter required" });
        }

        try
        {
            var history = await pageSnapshots.ListApiHistoryAsync(url, limit, cancellationToken);
            return Ok(new
            {
                url,
                history = history.Select(h => new
                {
                    h.Id,
                    h.FetchedAt,
                    h.Gsc,
                    h.Ga4,
                }),
            });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = ex.Message });
        }
    }

    [HttpGet("page-compare")]
    public async Task<IActionResult> PageCompare(
        [FromQuery] string url,
        [FromQuery] string currentType = "snapshot",
        [FromQuery] long currentId = 0,
        [FromQuery] string baselineType = "snapshot",
        [FromQuery] long baselineId = 0,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(url))
        {
            return BadRequest(new { error = "url parameter required" });
        }

        if (currentId <= 0 || baselineId <= 0)
        {
            return BadRequest(new { error = "currentId and baselineId are required" });
        }

        var current = await pageCompare.LoadArmAsync(currentType, currentId, url, cancellationToken);
        var baseline = await pageCompare.LoadArmAsync(baselineType, baselineId, url, cancellationToken);
        if (current is null)
        {
            return NotFound(new { error = "Current snapshot not found" });
        }

        if (baseline is null)
        {
            return NotFound(new { error = "Baseline snapshot not found" });
        }

        var metrics = PageMetricsCompare.Build(current.ToMetricsPayload(), baseline.ToMetricsPayload());

        return Ok(new
        {
            url,
            current = new
            {
                type = current.Type,
                id = current.Id,
                fetchedAt = current.FetchedAt,
                gsc = current.Gsc,
                ga4 = current.Ga4,
            },
            baseline = new
            {
                type = baseline.Type,
                id = baseline.Id,
                fetchedAt = baseline.FetchedAt,
                gsc = baseline.Gsc,
                ga4 = baseline.Ga4,
            },
            metrics,
        });
    }

    [HttpGet("keywords/by-page")]
    public async Task<IActionResult> KeywordsByPage(
        [FromQuery] string url,
        [FromQuery] string? propertyId,
        [FromQuery] string? domain,
        CancellationToken cancellationToken)
    {
        var pageUrl = (url ?? "").Trim();
        if (string.IsNullOrEmpty(pageUrl))
        {
            return BadRequest(new { error = "url parameter is required" });
        }

        var resolvedPropertyId = await properties.ResolvePropertyIdForPageAsync(
            pageUrl, propertyId, domain, cancellationToken);
        if (resolvedPropertyId is null)
        {
            return BadRequest(new { error = "propertyId or domain required" });
        }

        using var data = await keywordData.ReadLatestAsync(resolvedPropertyId.Value, cancellationToken);
        var allRows = ReadRows(data);
        var normalizedTarget = UrlJoinBuilder.NormalizeUrl(pageUrl);

        var pageKeywords = allRows
            .Where(r => MatchesUrl(GetString(r, "gsc_url"), normalizedTarget))
            .ToList();

        var cannib = new List<object>();
        if (data?.RootElement.TryGetProperty("cannibalisation", out var cannibArr) == true
            && cannibArr.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in cannibArr.EnumerateArray())
            {
                if (item.ValueKind != JsonValueKind.Object
                    || !item.TryGetProperty("pages", out var pages)
                    || pages.ValueKind != JsonValueKind.Array)
                {
                    continue;
                }

                var matches = pages.EnumerateArray().Any(p =>
                    p.ValueKind == JsonValueKind.Object
                    && p.TryGetProperty("url", out var pageUrlEl)
                    && (pageUrlEl.GetString() ?? "").ToLowerInvariant().TrimEnd('/') == normalizedTarget);

                if (matches)
                {
                    cannib.Add(JsonSerializer.Deserialize<object>(item.GetRawText())!);
                }
            }
        }

        return Ok(new
        {
            url = pageUrl,
            propertyId = resolvedPropertyId.Value,
            keyword_count = pageKeywords.Count,
            keywords = pageKeywords,
            cannibalisation = cannib,
            fetched_at = data is null ? null : GetRootString(data, "fetched_at"),
        });
    }

    [HttpGet("keywords/history")]
    public async Task<IActionResult> KeywordsHistory(
        [FromQuery] string keyword,
        [FromQuery] string? propertyId,
        [FromQuery] string? domain,
        [FromQuery] int limit = 30,
        CancellationToken cancellationToken = default)
    {
        keyword = (keyword ?? "").Trim();
        if (string.IsNullOrEmpty(keyword))
        {
            return BadRequest(new { error = "keyword parameter is required" });
        }

        var resolvedPropertyId = await properties.ResolvePropertyIdForPageAsync(
            "", propertyId, domain, cancellationToken);
        if (resolvedPropertyId is null)
        {
            return BadRequest(new { error = "propertyId or domain required" });
        }

        limit = Math.Clamp(limit, 1, 90);
        var history = await keywordData.ReadHistoryAsync(
            resolvedPropertyId.Value, keyword, limit, cancellationToken);

        return Ok(new
        {
            keyword,
            propertyId = resolvedPropertyId.Value,
            history = history.Select(h => new
            {
                fetched_at = h.FetchedAt,
                position = h.Position,
                clicks = h.Clicks,
                impressions = h.Impressions,
                ctr = h.Ctr,
            }),
        });
    }

    [HttpPost("keywords/history/batch")]
    public async Task<IActionResult> KeywordsHistoryBatch(
        [FromBody] KeywordHistoryBatchBody body,
        CancellationToken cancellationToken)
    {
        var keywordsRaw = body.Keywords ?? [];
        if (keywordsRaw.Count == 0 || keywordsRaw.Any(k => k is not string))
        {
            return BadRequest(new { error = "keywords must be a list" });
        }

        var keywords = keywordsRaw
            .OfType<string>()
            .Select(k => k.Trim())
            .Where(k => !string.IsNullOrEmpty(k))
            .Take(100)
            .ToList();
        var limit = Math.Clamp(body.Limit ?? 30, 1, 90);

        long? propertyId = body.PropertyId;
        if (propertyId is null or <= 0 && !string.IsNullOrWhiteSpace(body.Domain))
        {
            propertyId = await properties.GetPropertyIdByDomainAsync(body.Domain!, cancellationToken);
        }

        if (propertyId is null or <= 0)
        {
            return BadRequest(new { error = "propertyId or domain required" });
        }

        var results = await keywordData.ReadHistoryBatchAsync(
            propertyId.Value, keywords, limit, cancellationToken);

        return Ok(new
        {
            keywords = results.ToDictionary(
                kvp => kvp.Key,
                kvp => kvp.Value.Select(h => new
                {
                    fetched_at = h.FetchedAt,
                    position = h.Position,
                    clicks = h.Clicks,
                    impressions = h.Impressions,
                    ctr = h.Ctr,
                }).ToList()),
            propertyId = propertyId.Value,
        });
    }

    private static bool MatchesUrl(string candidate, string target)
    {
        if (string.IsNullOrWhiteSpace(candidate))
        {
            return false;
        }

        var normalized = UrlJoinBuilder.NormalizeUrl(candidate);
        var normalizedTarget = UrlJoinBuilder.NormalizeUrl(target);
        return normalized == normalizedTarget;
    }

    private static List<Dictionary<string, object?>> ReadRows(JsonDocument? data)
    {
        if (data is null
            || !data.RootElement.TryGetProperty("rows", out var rows)
            || rows.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        var result = new List<Dictionary<string, object?>>();
        foreach (var row in rows.EnumerateArray())
        {
            if (row.ValueKind != JsonValueKind.Object)
            {
                continue;
            }

            result.Add(JsonSerializer.Deserialize<Dictionary<string, object?>>(row.GetRawText()) ?? []);
        }

        if (result.Count > 1000)
        {
            return result.Take(1000).ToList();
        }

        return result;
    }

    private static string GetString(Dictionary<string, object?> row, string key) =>
        row.GetValueOrDefault(key)?.ToString() ?? "";

    private static string? GetRootString(JsonDocument data, string key) =>
        data.RootElement.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;
}

public sealed class PageLiveRequestBody
{
    public string? Url { get; init; }

    public long? PropertyId { get; init; }

    public string? Domain { get; init; }

    public bool? Persist { get; init; }
}

public sealed class KeywordHistoryBatchBody
{
    public List<object?>? Keywords { get; init; }

    public int? Limit { get; init; }

    public long? PropertyId { get; init; }

    public string? Domain { get; init; }
}

public sealed class KeywordExpandBody
{
    public string? Keyword { get; init; }

    public long? PropertyId { get; init; }
}

public sealed class KeywordPlannerBody
{
    public List<object?>? Keywords { get; init; }
}
