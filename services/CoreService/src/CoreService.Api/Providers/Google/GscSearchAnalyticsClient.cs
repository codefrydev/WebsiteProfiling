using CoreService.Api.IntegrationsApplication.Google;
using Google.Apis.Http;
using Google.Apis.SearchConsole.v1;
using Google.Apis.SearchConsole.v1.Data;
using Google.Apis.Services;
using WebsiteProfiling.Contracts.Google;

namespace CoreService.Api.Providers.Google;

public sealed class GscSearchAnalyticsClient : IGscSearchAnalyticsClient
{
    private const int DefaultRowLimit = 1000;

    public async Task<IReadOnlyList<string>> ListSitesAsync(
        IConfigurableHttpClientInitializer credential,
        CancellationToken cancellationToken = default)
    {
        var service = BuildService(credential);
        var resp = await CallWithRetry(
            () => service.Sites.List().ExecuteAsync(cancellationToken),
            cancellationToken);
        return resp.SiteEntry?
            .Where(s => !string.IsNullOrWhiteSpace(s.SiteUrl))
            .Select(s => s.SiteUrl!)
            .ToList() ?? [];
    }

    public (string? ResolvedSite, string? Error) ResolveSiteUrl(string configured, IReadOnlyList<string> sites)
    {
        configured = (configured ?? "").Trim();
        if (string.IsNullOrEmpty(configured))
        {
            return (null, "No GSC site URL configured.");
        }

        if (sites.Contains(configured))
        {
            return (configured, null);
        }

        var configuredKey = UrlPrefixKey(configured);
        if (configuredKey is not null)
        {
            foreach (var site in sites)
            {
                if (UrlPrefixKey(site) == configuredKey)
                {
                    return (site, null);
                }
            }
        }

        var configuredDomain = DomainFromSiteUrl(configured);
        if (configuredDomain is not null)
        {
            foreach (var site in sites)
            {
                if (DomainFromSiteUrl(site) == configuredDomain)
                {
                    return (site, null);
                }
            }
        }

        var siteList = sites.Count > 0 ? string.Join(", ", sites) : "(none)";
        var hint = "";
        if (configured.StartsWith("http://", StringComparison.OrdinalIgnoreCase)
            || configured.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        {
            if (!configured.EndsWith('/'))
            {
                var trailing = configured + "/";
                if (sites.Contains(trailing))
                {
                    hint = $" Use the exact URL '{trailing}' from Search Console.";
                }
            }
        }
        else if (configured.EndsWith('/'))
        {
            var noTrailing = configured.TrimEnd('/');
            if (sites.Contains(noTrailing))
            {
                hint = $" Use the exact URL '{noTrailing}' from Search Console.";
            }
        }

        return (
            null,
            $"Configured GSC site '{configured}' does not match any accessible property.{hint} "
            + $"Accessible sites: [{siteList}]. "
            + "Open Integrations, click 'Load from account', pick the site from the dropdown, and Save settings.");
    }

    public async Task<GscFetchResult> FetchDataAsync(
        IConfigurableHttpClientInitializer credential,
        string siteUrl,
        int dateRangeDays,
        int rowLimit = DefaultRowLimit,
        int maxRows = 25000,
        CancellationToken cancellationToken = default)
    {
        var service = BuildService(credential);
        var end = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-3);
        var start = end.AddDays(-(dateRangeDays - 1));

        async Task<IList<ApiDataRow>> QueryAsync(IList<string> dimensions, int pageLimit)
        {
            var allRows = new List<ApiDataRow>();
            var startRow = 0;
            while (allRows.Count < maxRows)
            {
                var body = new SearchAnalyticsQueryRequest
                {
                    StartDate = start.ToString("yyyy-MM-dd"),
                    EndDate = end.ToString("yyyy-MM-dd"),
                    Dimensions = dimensions,
                    RowLimit = Math.Min(pageLimit, maxRows - allRows.Count),
                    StartRow = startRow,
                };
                var resp = await CallWithRetry(
                    () => service.Searchanalytics.Query(body, siteUrl).ExecuteAsync(cancellationToken),
                    cancellationToken);
                var page = resp.Rows ?? [];
                if (page.Count == 0)
                {
                    break;
                }

                allRows.AddRange(page);
                if (page.Count < pageLimit)
                {
                    break;
                }

                startRow += page.Count;
            }

            return allRows;
        }

        var queryRows = await QueryAsync(["query"], rowLimit);
        var pageRows = await QueryAsync(["page"], rowLimit);
        var pageQueryCap = Math.Min(maxRows, 15000);
        var pageQueryRows = (await QueryAsync(["page", "query"], rowLimit)).Take(pageQueryCap).ToList();
        var dailyRows = await QueryAsync(["date"], 100);

        var allQueries = queryRows.Select(ToQueryRecord).ToList();
        var allPages = pageRows.Select(ToPageRecord).ToList();
        var daily = dailyRows
            .Select(ToDailyRecord)
            .Where(r => !string.IsNullOrEmpty(r.Date))
            .OrderBy(r => r.Date)
            .ToList();

        var totalClicks = allPages.Sum(r => r.Clicks);
        var totalImpressions = allPages.Sum(r => r.Impressions);
        var avgCtr = totalImpressions > 0
            ? Math.Round(totalClicks / (double)totalImpressions * 100, 2)
            : 0.0;
        var avgPosition = allPages.Count > 0
            ? Math.Round(allPages.Average(r => r.Position), 1)
            : 0.0;

        var byPage = allPages
            .Where(r => !string.IsNullOrEmpty(r.Page))
            .ToDictionary(
                r => r.Page,
                r => new GscPageDetail
                {
                    Page = r.Page,
                    Clicks = r.Clicks,
                    Impressions = r.Impressions,
                    Ctr = r.Ctr,
                    Position = r.Position,
                    Queries = [],
                },
                StringComparer.Ordinal);

        foreach (var raw in pageQueryRows)
        {
            var keys = raw.Keys ?? [];
            if (keys.Count < 2)
            {
                continue;
            }

            var pageUrl = keys[0];
            var queryText = keys[1];
            if (string.IsNullOrEmpty(pageUrl) || string.IsNullOrEmpty(queryText))
            {
                continue;
            }

            var qrec = ToQueryRecord(raw);
            if (!byPage.TryGetValue(pageUrl, out var detail))
            {
                detail = new GscPageDetail
                {
                    Page = pageUrl,
                    Queries = [],
                };
                byPage[pageUrl] = detail;
            }

            detail.Queries.Add(qrec);
        }

        return new GscFetchResult
        {
            SiteUrl = siteUrl,
            Summary = new GscSummary
            {
                Clicks = totalClicks,
                Impressions = totalImpressions,
                Ctr = avgCtr,
                Position = avgPosition,
            },
            TopQueries = allQueries,
            TopPages = allPages,
            ByPage = byPage,
            Daily = daily,
            DateStart = start.ToString("yyyy-MM-dd"),
            DateEnd = end.ToString("yyyy-MM-dd"),
        };
    }

    public async Task<(bool Ok, string Message)> ProbeSiteAsync(
        IConfigurableHttpClientInitializer credential,
        string siteUrl,
        CancellationToken cancellationToken = default)
    {
        siteUrl = (siteUrl ?? "").Trim();
        if (string.IsNullOrEmpty(siteUrl))
        {
            return (false, "No GSC site URL configured.");
        }

        try
        {
            var service = BuildService(credential);
            var end = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-3);
            var start = end.AddDays(-6);
            var body = new SearchAnalyticsQueryRequest
            {
                StartDate = start.ToString("yyyy-MM-dd"),
                EndDate = end.ToString("yyyy-MM-dd"),
                Dimensions = ["query"],
                RowLimit = 1,
            };
            var resp = await CallWithRetry(
                () => service.Searchanalytics.Query(body, siteUrl).ExecuteAsync(cancellationToken),
                cancellationToken);
            var rows = resp.Rows ?? [];
            if (rows.Count == 0)
            {
                return (true,
                    $"Site '{siteUrl}' is accessible, but returned 0 search rows for the last 7 days "
                    + "(new property, low traffic, or indexing still in progress).");
            }

            var row = rows[0];
            var query = row.Keys?.FirstOrDefault() ?? "";
            var impressions = (int)(row.Impressions ?? 0);
            return (true,
                $"Site '{siteUrl}' is accessible "
                + $"(sample query: '{query}', {impressions} impression(s) in probe window).");
        }
        catch (Exception ex)
        {
            var msg = ex.Message;
            if (msg.Contains("403", StringComparison.Ordinal) || msg.Contains("Forbidden", StringComparison.OrdinalIgnoreCase))
            {
                return (false,
                    $"Site '{siteUrl}' is not accessible with the connected Google account. "
                    + "Confirm the account has access in Search Console, or pick the site from "
                    + "Integrations > Load from account.");
            }

            if (msg.Contains("404", StringComparison.Ordinal) || msg.Contains("not found", StringComparison.OrdinalIgnoreCase))
            {
                return (false,
                    $"Site '{siteUrl}' was not found. Search Console requires the exact property URL "
                    + "(URL-prefix properties usually end with a trailing slash).");
            }

            return (false, $"GSC probe for '{siteUrl}' failed: {msg}");
        }
    }

    private static SearchConsoleService BuildService(IConfigurableHttpClientInitializer credential) =>
        new(new BaseClientService.Initializer
        {
            HttpClientInitializer = credential,
            ApplicationName = "WebsiteProfiling",
        });

    private static async Task<T> CallWithRetry<T>(
        Func<Task<T>> fn,
        CancellationToken cancellationToken,
        int maxRetries = 3,
        double baseDelaySeconds = 2.0)
    {
        for (var attempt = 0; attempt < maxRetries; attempt++)
        {
            try
            {
                return await fn();
            }
            catch (Exception ex) when (attempt < maxRetries - 1 && IsRetryable(ex))
            {
                var delay = TimeSpan.FromSeconds(baseDelaySeconds * Math.Pow(2, attempt));
                await Task.Delay(delay, cancellationToken);
            }
        }

        return await fn();
    }

    private static bool IsRetryable(Exception ex)
    {
        var msg = ex.Message;
        return msg.Contains("429", StringComparison.Ordinal) || msg.Contains("503", StringComparison.Ordinal);
    }

    private static GscQueryRecord ToQueryRecord(ApiDataRow row)
    {
        var keys = row.Keys ?? [];
        return new GscQueryRecord
        {
            Query = keys.Count > 0 ? keys[0] : "",
            Clicks = (int)(row.Clicks ?? 0),
            Impressions = (int)(row.Impressions ?? 0),
            Ctr = Math.Round((row.Ctr ?? 0) * 100, 2),
            Position = Math.Round(row.Position ?? 0, 1),
        };
    }

    private static GscPageRecord ToPageRecord(ApiDataRow row)
    {
        var keys = row.Keys ?? [];
        return new GscPageRecord
        {
            Page = keys.Count > 0 ? keys[0] : "",
            Clicks = (int)(row.Clicks ?? 0),
            Impressions = (int)(row.Impressions ?? 0),
            Ctr = Math.Round((row.Ctr ?? 0) * 100, 2),
            Position = Math.Round(row.Position ?? 0, 1),
        };
    }

    private static GscDailyRecord ToDailyRecord(ApiDataRow row)
    {
        var keys = row.Keys ?? [];
        return new GscDailyRecord
        {
            Date = keys.Count > 0 ? keys[0] : "",
            Clicks = (int)(row.Clicks ?? 0),
            Impressions = (int)(row.Impressions ?? 0),
            Ctr = Math.Round((row.Ctr ?? 0) * 100, 2),
            Position = Math.Round(row.Position ?? 0, 1),
        };
    }

    private static string? UrlPrefixKey(string siteUrl)
    {
        siteUrl = siteUrl.Trim();
        if (siteUrl.StartsWith("sc-domain:", StringComparison.OrdinalIgnoreCase))
        {
            return siteUrl.ToLowerInvariant();
        }

        if (!siteUrl.StartsWith("http://", StringComparison.OrdinalIgnoreCase)
            && !siteUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        if (!Uri.TryCreate(siteUrl, UriKind.Absolute, out var parsed))
        {
            return null;
        }

        var host = StripWwwPrefix(parsed.Host.ToLowerInvariant());
        var path = parsed.AbsolutePath.TrimEnd('/');
        return $"{parsed.Scheme.ToLowerInvariant()}://{host}{path}/";
    }

    private static string? DomainFromSiteUrl(string siteUrl)
    {
        siteUrl = siteUrl.Trim();
        if (siteUrl.StartsWith("sc-domain:", StringComparison.OrdinalIgnoreCase))
        {
            return StripWwwPrefix(siteUrl.Split(':', 2)[1].ToLowerInvariant());
        }

        if (siteUrl.StartsWith("http://", StringComparison.OrdinalIgnoreCase)
            || siteUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        {
            return Uri.TryCreate(siteUrl, UriKind.Absolute, out var parsed)
                ? StripWwwPrefix(parsed.Host.ToLowerInvariant())
                : null;
        }

        return null;
    }

    private static string StripWwwPrefix(string host) =>
        host.StartsWith("www.", StringComparison.OrdinalIgnoreCase) ? host[4..] : host;

    public async Task<(Dictionary<string, object?>? PageData, IReadOnlyList<string> Errors)> FetchPageLiveAsync(
        IConfigurableHttpClientInitializer credential,
        string siteUrl,
        string pageUrl,
        int dateRangeDays,
        CancellationToken cancellationToken = default)
    {
        var errors = new List<string>();
        try
        {
            var service = BuildService(credential);
            var end = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-3);
            var start = end.AddDays(-(Math.Max(1, dateRangeDays) - 1));

            async Task<IList<ApiDataRow>> QueryAsync(IList<string> dimensions, int rowLimit)
            {
                var body = new SearchAnalyticsQueryRequest
                {
                    StartDate = start.ToString("yyyy-MM-dd"),
                    EndDate = end.ToString("yyyy-MM-dd"),
                    Dimensions = dimensions,
                    DimensionFilterGroups =
                    [
                        new()
                        {
                            Filters =
                            [
                                new()
                                {
                                    Dimension = "page",
                                    Operator__ = "equals",
                                    Expression = pageUrl,
                                },
                            ],
                        },
                    ],
                    RowLimit = rowLimit,
                };
                var resp = await CallWithRetry(
                    () => service.Searchanalytics.Query(body, siteUrl).ExecuteAsync(cancellationToken),
                    cancellationToken);
                return resp.Rows ?? [];
            }

            var pageRows = (await QueryAsync(["page"], 5)).ToList();
            var queryRows = (await QueryAsync(["page", "query"], 100)).ToList();

            if (pageRows.Count == 0 && queryRows.Count == 0)
            {
                var alt = pageUrl.EndsWith('/') ? pageUrl.TrimEnd('/') : pageUrl + "/";
                if (alt != pageUrl)
                {
                    pageUrl = alt;
                    pageRows = (await QueryAsync(["page"], 5)).ToList();
                    queryRows = (await QueryAsync(["page", "query"], 100)).ToList();
                }
            }

            if (pageRows.Count == 0 && queryRows.Count == 0)
            {
                return (null, ["No GSC data for page in date range."]);
            }

            var clicks = 0;
            var impressions = 0;
            var ctrSum = 0.0;
            var posSum = 0.0;
            var n = 0;
            foreach (var row in pageRows)
            {
                clicks += (int)(row.Clicks ?? 0);
                impressions += (int)(row.Impressions ?? 0);
                ctrSum += row.Ctr ?? 0;
                posSum += row.Position ?? 0;
                n++;
            }

            var queries = new List<Dictionary<string, object?>>();
            foreach (var row in queryRows)
            {
                var keys = row.Keys ?? [];
                if (keys.Count < 2)
                {
                    continue;
                }

                queries.Add(new Dictionary<string, object?>
                {
                    ["query"] = keys[1],
                    ["clicks"] = (int)(row.Clicks ?? 0),
                    ["impressions"] = (int)(row.Impressions ?? 0),
                    ["ctr"] = Math.Round((row.Ctr ?? 0) * 100, 2),
                    ["position"] = Math.Round(row.Position ?? 0, 1),
                });
            }

            queries = queries
                .OrderByDescending(q => Convert.ToInt32(q["impressions"] ?? 0))
                .Take(25)
                .ToList();

            var pageData = new Dictionary<string, object?>
            {
                ["page"] = pageUrl,
                ["clicks"] = clicks,
                ["impressions"] = impressions,
                ["ctr"] = Math.Round(impressions > 0 ? clicks / (double)impressions * 100 : 0.0, 2),
                ["position"] = Math.Round(n > 0 ? posSum / n : 0.0, 1),
                ["queries"] = queries,
            };
            return (pageData, errors);
        }
        catch (Exception ex)
        {
            return (null, [ex.Message]);
        }
    }

    public async Task<Dictionary<string, object?>> InspectUrlAsync(
        IConfigurableHttpClientInitializer credential,
        string siteUrl,
        string url,
        CancellationToken cancellationToken = default)
    {
        url = (url ?? "").Trim();
        var sites = await ListSitesAsync(credential, cancellationToken);
        var (resolved, err) = ResolveSiteUrl(siteUrl, sites);
        if (resolved is null)
        {
            return new Dictionary<string, object?>
            {
                ["ok"] = false,
                ["url"] = url,
                ["error"] = err ?? "GSC site URL not accessible.",
                ["provenance"] = "Search Console",
            };
        }

        try
        {
            var service = BuildService(credential);
            var body = new InspectUrlIndexRequest
            {
                InspectionUrl = url,
                SiteUrl = resolved,
            };
            var resp = await CallWithRetry(
                () => service.UrlInspection.Index.Inspect(body).ExecuteAsync(cancellationToken),
                cancellationToken);

            var inspection = resp.InspectionResult;
            var indexStatus = inspection?.IndexStatusResult;
            var rich = inspection?.RichResultsResult;
            var verdict = rich?.Verdict ?? "UNKNOWN";
            var types = new List<string>();
            if (rich?.DetectedItems is not null)
            {
                foreach (var item in rich.DetectedItems)
                {
                    if (!string.IsNullOrWhiteSpace(item.RichResultType))
                    {
                        types.Add(item.RichResultType);
                    }
                }
            }

            var issues = new List<string>();
            // RichResultsInspectionResult in Google.Apis.SearchConsole.v1 has no Issues collection.

            return new Dictionary<string, object?>
            {
                ["ok"] = true,
                ["url"] = url,
                ["site_url"] = resolved,
                ["indexing"] = new Dictionary<string, object?>
                {
                    ["verdict"] = indexStatus?.Verdict,
                    ["coverage_state"] = indexStatus?.CoverageState,
                    ["robots_txt_state"] = indexStatus?.RobotsTxtState,
                    ["indexing_state"] = indexStatus?.IndexingState,
                    ["last_crawl_time"] = indexStatus?.LastCrawlTimeRaw,
                    ["page_fetch_state"] = indexStatus?.PageFetchState,
                },
                ["rich_results"] = new Dictionary<string, object?>
                {
                    ["verdict"] = verdict,
                    ["schema_types"] = types.Take(10).ToList(),
                    ["issues"] = issues,
                },
                ["provenance"] = "Search Console",
            };
        }
        catch (Exception ex)
        {
            return new Dictionary<string, object?>
            {
                ["ok"] = false,
                ["url"] = url,
                ["error"] = ex.Message,
                ["provenance"] = "Search Console",
            };
        }
    }
}
