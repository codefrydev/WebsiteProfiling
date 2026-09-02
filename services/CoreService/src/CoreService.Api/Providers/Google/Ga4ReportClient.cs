using CoreService.Api.IntegrationsApplication.Google;
using Google.Apis.AnalyticsData.v1beta;
using Google.Apis.AnalyticsData.v1beta.Data;
using Google.Apis.GoogleAnalyticsAdmin.v1alpha;
using Google.Apis.Http;
using Google.Apis.Services;
using WebsiteProfiling.Contracts.Google;

namespace CoreService.Api.Providers.Google;

public sealed class Ga4ReportClient : IGa4ReportClient
{
    public async Task<Ga4FetchResult> FetchDataAsync(
        IConfigurableHttpClientInitializer credential,
        string propertyId,
        int dateRangeDays,
        string startUrl,
        CancellationToken cancellationToken = default)
    {
        var client = new AnalyticsDataService(new BaseClientService.Initializer
        {
            HttpClientInitializer = credential,
            ApplicationName = "WebsiteProfiling",
        });

        var end = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-1);
        var start = end.AddDays(-(dateRangeDays - 1));
        var dateRange = new List<DateRange>
        {
            new() { StartDate = start.ToString("yyyy-MM-dd"), EndDate = end.ToString("yyyy-MM-dd") },
        };
        var coreMetrics = new List<Metric>
        {
            new() { Name = "sessions" },
            new() { Name = "activeUsers" },
            new() { Name = "screenPageViews" },
        };

        async Task<RunReportResponse> RunReportAsync(
            IList<string> dimensions,
            IList<Metric> metrics,
            int limit,
            IList<OrderBy>? orderBys = null)
        {
            var request = new RunReportRequest
            {
                DateRanges = dateRange,
                Dimensions = dimensions.Select(d => new Dimension { Name = d }).ToList(),
                Metrics = metrics,
                Limit = limit,
                OrderBys = orderBys,
            };
            return await CallWithRetry(
                () => client.Properties.RunReport(request, $"properties/{propertyId}").ExecuteAsync(cancellationToken),
                cancellationToken);
        }

        var pagesResponse = await RunReportAsync(
            ["pagePath"],
            [
                new Metric { Name = "sessions" },
                new Metric { Name = "activeUsers" },
                new Metric { Name = "screenPageViews" },
                new Metric { Name = "engagementRate" },
                new Metric { Name = "averageSessionDuration" },
            ],
            1000,
            [new OrderBy { Metric = new MetricOrderBy { MetricName = "sessions" }, Desc = true }]);

        var rows = new List<Ga4PageRecord>();
        foreach (var row in pagesResponse.Rows ?? [])
        {
            var path = row.DimensionValues?.FirstOrDefault()?.Value ?? "";
            var vals = row.MetricValues?.Select(v => v.Value).ToList() ?? [];
            var fullUrl = !string.IsNullOrEmpty(startUrl) && !string.IsNullOrEmpty(path)
                ? UrlJoinBuilder.PathToUrl(path, startUrl)
                : "";
            rows.Add(new Ga4PageRecord
            {
                Path = path,
                FullUrl = fullUrl,
                Sessions = ParseInt(vals, 0),
                ActiveUsers = ParseInt(vals, 1),
                ScreenPageViews = ParseInt(vals, 2),
                EngagementRate = ParseDouble(vals, 3, 4),
                AvgSessionDuration = ParseDouble(vals, 4, 1),
            });
        }

        var dailyResponse = await RunReportAsync(
            ["date"],
            coreMetrics,
            400,
            [new OrderBy { Dimension = new DimensionOrderBy { DimensionName = "date" } }]);

        var daily = (dailyResponse.Rows ?? [])
            .Select(row =>
            {
                var d = row.DimensionValues?.FirstOrDefault()?.Value ?? "";
                var vals = row.MetricValues?.Select(v => v.Value).ToList() ?? [];
                return new Ga4DailyRecord
                {
                    Date = d,
                    Sessions = ParseInt(vals, 0),
                    ActiveUsers = ParseInt(vals, 1),
                    ScreenPageViews = ParseInt(vals, 2),
                };
            })
            .Where(r => !string.IsNullOrEmpty(r.Date))
            .OrderBy(r => r.Date)
            .ToList();

        var channelResponse = await RunReportAsync(
            ["sessionDefaultChannelGroup"],
            coreMetrics,
            20,
            [new OrderBy { Metric = new MetricOrderBy { MetricName = "sessions" }, Desc = true }]);

        var byChannel = (channelResponse.Rows ?? [])
            .Select(row =>
            {
                var ch = row.DimensionValues?.FirstOrDefault()?.Value ?? "";
                var vals = row.MetricValues?.Select(v => v.Value).ToList() ?? [];
                return new Ga4ChannelRecord
                {
                    Channel = ch,
                    Sessions = ParseInt(vals, 0),
                    ActiveUsers = ParseInt(vals, 1),
                    ScreenPageViews = ParseInt(vals, 2),
                };
            })
            .ToList();

        var deviceResponse = await RunReportAsync(
            ["deviceCategory"],
            coreMetrics,
            10,
            [new OrderBy { Metric = new MetricOrderBy { MetricName = "sessions" }, Desc = true }]);

        var byDevice = (deviceResponse.Rows ?? [])
            .Select(row =>
            {
                var dev = row.DimensionValues?.FirstOrDefault()?.Value ?? "";
                var vals = row.MetricValues?.Select(v => v.Value).ToList() ?? [];
                return new Ga4DeviceRecord
                {
                    Device = dev,
                    Sessions = ParseInt(vals, 0),
                    ActiveUsers = ParseInt(vals, 1),
                    ScreenPageViews = ParseInt(vals, 2),
                };
            })
            .ToList();

        return new Ga4FetchResult
        {
            PropertyId = propertyId,
            Summary = new Ga4Summary
            {
                Sessions = rows.Sum(r => r.Sessions),
                ActiveUsers = rows.Sum(r => r.ActiveUsers),
                ScreenPageViews = rows.Sum(r => r.ScreenPageViews),
            },
            TopPages = rows,
            ByPath = rows.Where(r => !string.IsNullOrEmpty(r.Path))
                .ToDictionary(r => r.Path, r => r, StringComparer.Ordinal),
            Daily = daily,
            ByChannel = byChannel,
            ByDevice = byDevice,
            DateStart = start.ToString("yyyy-MM-dd"),
            DateEnd = end.ToString("yyyy-MM-dd"),
        };
    }

    public async Task<(IReadOnlyList<Ga4PropertySummary> Properties, string? Error)> ListPropertiesAsync(
        IConfigurableHttpClientInitializer credential,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var client = new GoogleAnalyticsAdminService(new BaseClientService.Initializer
            {
                HttpClientInitializer = credential,
                ApplicationName = "WebsiteProfiling",
            });

            var results = new List<Ga4PropertySummary>();
            var request = client.AccountSummaries.List();
            do
            {
                var response = await request.ExecuteAsync(cancellationToken);
                foreach (var accountSummary in response.AccountSummaries ?? [])
                {
                    foreach (var prop in accountSummary.PropertySummaries ?? [])
                    {
                        var propId = prop.Property?.Split('/').LastOrDefault() ?? "";
                        results.Add(new Ga4PropertySummary
                        {
                            Id = propId,
                            DisplayName = prop.DisplayName ?? propId,
                            AccountName = accountSummary.DisplayName ?? "",
                        });
                    }
                }

                request.PageToken = response.NextPageToken;
            } while (!string.IsNullOrEmpty(request.PageToken));

            if (results.Count == 0)
            {
                return ([], "No GA4 properties returned for this Google account. "
                    + "Confirm the account has Analytics access, or enter the numeric property ID "
                    + "from GA4 Admin > Property Settings and run Test connection.");
            }

            return (results, null);
        }
        catch (Exception ex)
        {
            return ([], $"Could not list GA4 properties: {ex.Message}");
        }
    }

    public async Task<(bool Ok, string Message)> ProbePropertyAsync(
        IConfigurableHttpClientInitializer credential,
        string propertyId,
        CancellationToken cancellationToken = default)
    {
        propertyId = (propertyId ?? "").Trim();
        if (string.IsNullOrEmpty(propertyId))
        {
            return (false, "No GA4 property ID configured.");
        }

        try
        {
            var client = new AnalyticsDataService(new BaseClientService.Initializer
            {
                HttpClientInitializer = credential,
                ApplicationName = "WebsiteProfiling",
            });
            var request = new RunReportRequest
            {
                DateRanges = [new DateRange { StartDate = "7daysAgo", EndDate = "yesterday" }],
                Metrics = [new Metric { Name = "sessions" }],
                Limit = 1,
            };
            var response = await CallWithRetry(
                () => client.Properties.RunReport(request, $"properties/{propertyId}").ExecuteAsync(cancellationToken),
                cancellationToken);
            var rowCount = response.Rows?.Count ?? 0;
            if (rowCount == 0)
            {
                return (true,
                    $"GA4 property {propertyId} is accessible, but returned 0 rows for the last 7 days. "
                    + "The property may be new, have no traffic yet, or use a different date range.");
            }

            var sessions = 0;
            if (response.Rows![0].MetricValues?.Count > 0)
            {
                sessions = ParseInt([response.Rows[0].MetricValues[0].Value], 0);
            }

            return (true,
                $"GA4 property {propertyId} is accessible "
                + $"(sample: {rowCount} row(s), {sessions} session(s) in probe window).");
        }
        catch (Exception ex)
        {
            var msg = ex.Message;
            if (msg.Contains("PERMISSION_DENIED", StringComparison.Ordinal) || msg.Contains("403", StringComparison.Ordinal))
            {
                return (false,
                    $"GA4 property {propertyId} is not accessible with the connected Google account. "
                    + "Open GA4 Admin and confirm this account has at least Viewer access to the property.");
            }

            if (msg.Contains("NOT_FOUND", StringComparison.Ordinal) || msg.Contains("404", StringComparison.Ordinal))
            {
                return (false,
                    $"GA4 property {propertyId} was not found. "
                    + "Use the numeric Property ID from GA4 Admin > Property Settings (not the G-XXXXXXX Measurement ID).");
            }

            return (false, $"GA4 property {propertyId} probe failed: {msg}");
        }
    }

    public async Task<(Dictionary<string, object?>? PageData, IReadOnlyList<string> Errors)> FetchPageLiveAsync(
        IConfigurableHttpClientInitializer credential,
        string propertyId,
        string pageUrl,
        string startUrl,
        int dateRangeDays,
        CancellationToken cancellationToken = default)
    {
        var errors = new List<string>();
        var path = UrlJoinBuilder.UrlToPath(pageUrl);
        var end = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-1);
        var start = end.AddDays(-(Math.Max(1, dateRangeDays) - 1));

        var client = new AnalyticsDataService(new BaseClientService.Initializer
        {
            HttpClientInitializer = credential,
            ApplicationName = "WebsiteProfiling",
        });

        var request = new RunReportRequest
        {
            DateRanges =
            [
                new DateRange
                {
                    StartDate = start.ToString("yyyy-MM-dd"),
                    EndDate = end.ToString("yyyy-MM-dd"),
                },
            ],
            Dimensions = [new Dimension { Name = "pagePath" }],
            Metrics =
            [
                new Metric { Name = "sessions" },
                new Metric { Name = "activeUsers" },
                new Metric { Name = "screenPageViews" },
                new Metric { Name = "engagementRate" },
                new Metric { Name = "averageSessionDuration" },
            ],
            DimensionFilter = new FilterExpression
            {
                Filter = new Filter
                {
                    FieldName = "pagePath",
                    StringFilter = new StringFilter
                    {
                        Value = path,
                        MatchType = "EXACT",
                    },
                },
            },
            Limit = 5,
        };

        try
        {
            var response = await CallWithRetry(
                () => client.Properties.RunReport(request, $"properties/{propertyId}").ExecuteAsync(cancellationToken),
                cancellationToken);

            if (response.Rows is null || response.Rows.Count == 0)
            {
                return (null, [$"No GA4 data for path {path} in date range."]);
            }

            var row = response.Rows[0];
            var vals = row.MetricValues?.Select(v => v.Value).ToList() ?? [];
            var pageData = new Dictionary<string, object?>
            {
                ["path"] = path,
                ["full_url"] = !string.IsNullOrEmpty(startUrl)
                    ? UrlJoinBuilder.PathToUrl(path, startUrl)
                    : pageUrl,
                ["sessions"] = ParseInt(vals, 0),
                ["activeUsers"] = ParseInt(vals, 1),
                ["screenPageViews"] = ParseInt(vals, 2),
                ["engagementRate"] = ParseDouble(vals, 3, 4),
                ["avgSessionDuration"] = ParseDouble(vals, 4, 1),
            };
            return (pageData, errors);
        }
        catch (Exception ex)
        {
            return (null, [ex.Message]);
        }
    }

    private static int ParseInt(IReadOnlyList<string?> vals, int index)
    {
        if (index >= vals.Count || string.IsNullOrWhiteSpace(vals[index]))
        {
            return 0;
        }

        return int.TryParse(vals[index], out var i)
            ? i
            : (int)Math.Round(double.Parse(vals[index]!, System.Globalization.CultureInfo.InvariantCulture));
    }

    private static double ParseDouble(IReadOnlyList<string?> vals, int index, int decimals)
    {
        if (index >= vals.Count || string.IsNullOrWhiteSpace(vals[index]))
        {
            return 0.0;
        }

        var value = double.Parse(vals[index]!, System.Globalization.CultureInfo.InvariantCulture);
        return Math.Round(value, decimals);
    }

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
            catch (Exception ex) when (ex.Message.Contains("RESOURCE_EXHAUSTED", StringComparison.Ordinal))
            {
                throw new InvalidOperationException(
                    "GA4 quota exceeded — try again tomorrow. "
                    + "(Google Analytics Data API daily token quota reached.)");
            }
        }

        return await fn();
    }

    private static bool IsRetryable(Exception ex)
    {
        var msg = ex.Message;
        return msg.Contains("ServiceUnavailable", StringComparison.OrdinalIgnoreCase)
            || msg.Contains("TooManyRequests", StringComparison.OrdinalIgnoreCase)
            || msg.Contains("503", StringComparison.Ordinal)
            || msg.Contains("429", StringComparison.Ordinal);
    }
}
