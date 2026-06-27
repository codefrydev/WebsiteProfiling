using System.Text.Json;
using ReportService.Application.Repositories;

namespace ReportService.Application.Build;

/// <summary>
/// Port of Python <c>browser_diagnostics.aggregate_browser_diagnostics_df</c> for report_meta.crawl_scope.
/// </summary>
public static class BrowserDiagnosticsAggregator
{
    private sealed class MessageBucket
    {
        public string Text { get; init; } = "";
        public int Count { get; set; }
        public List<string> SampleUrls { get; } = [];
    }

    public static Dictionary<string, object?>? Aggregate(IReadOnlyList<CrawlRow> rows)
    {
        if (rows.Count == 0 || rows.All(r => string.IsNullOrWhiteSpace(r.PageAnalysisJson)))
        {
            return null;
        }

        var pagesWithConsoleErrors = 0;
        var pagesWithPageErrors = 0;
        var pagesWithFailedRequests = 0;
        var totalConsoleErrors = 0;
        var totalPageErrors = 0;
        var totalFailedRequests = 0;
        var messageCounts = new Dictionary<string, MessageBucket>(StringComparer.Ordinal);
        var exceptionCounts = new Dictionary<string, MessageBucket>(StringComparer.Ordinal);

        foreach (var row in rows)
        {
            var pa = CategoryHelpers.ParsePageAnalysisCell(row.PageAnalysisJson);
            if (pa.Count == 0)
            {
                continue;
            }

            var counts = BrowserDiagnosticsHelper.SummaryFromPageAnalysis(pa);
            var url = row.Url.Trim();
            if (counts.ConsoleErrorCount > 0)
            {
                pagesWithConsoleErrors++;
                totalConsoleErrors += counts.ConsoleErrorCount;
            }

            if (counts.PageErrorCount > 0)
            {
                pagesWithPageErrors++;
                totalPageErrors += counts.PageErrorCount;
            }

            if (counts.FailedRequestCount > 0)
            {
                pagesWithFailedRequests++;
                totalFailedRequests += counts.FailedRequestCount;
            }

            AccumulateConsoleMessages(pa, url, messageCounts);
            AccumulatePageErrors(pa, url, exceptionCounts);
        }

        if (pagesWithConsoleErrors == 0
            && pagesWithPageErrors == 0
            && pagesWithFailedRequests == 0
            && totalConsoleErrors == 0
            && totalPageErrors == 0
            && totalFailedRequests == 0)
        {
            return null;
        }

        var topConsoleMessages = TopBuckets(messageCounts);
        var topPageErrors = TopBuckets(exceptionCounts);

        return new Dictionary<string, object?>
        {
            ["pages_with_console_errors"] = pagesWithConsoleErrors,
            ["pages_with_page_errors"] = pagesWithPageErrors,
            ["pages_with_failed_requests"] = pagesWithFailedRequests,
            ["total_console_errors"] = totalConsoleErrors,
            ["total_page_errors"] = totalPageErrors,
            ["total_failed_requests"] = totalFailedRequests,
            ["top_console_messages"] = topConsoleMessages,
            ["top_page_errors"] = topPageErrors,
        };
    }

    private static List<Dictionary<string, object?>> TopBuckets(Dictionary<string, MessageBucket> buckets) =>
        buckets.Values
            .OrderByDescending(b => b.Count)
            .Take(5)
            .Select(b => (Dictionary<string, object?>)new Dictionary<string, object?>
            {
                ["text"] = b.Text,
                ["count"] = b.Count,
                ["sample_urls"] = b.SampleUrls,
            })
            .ToList();

    private static void AccumulateConsoleMessages(
        IReadOnlyDictionary<string, object?> pageAnalysis,
        string url,
        Dictionary<string, MessageBucket> messageCounts)
    {
        if (!TryGetBrowserJson(pageAnalysis, out var browserJson))
        {
            return;
        }

        try
        {
            using var doc = JsonDocument.Parse(browserJson);
            if (!doc.RootElement.TryGetProperty("console", out var console)
                || console.ValueKind != JsonValueKind.Array)
            {
                return;
            }

            foreach (var msg in console.EnumerateArray())
            {
                if (msg.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }

                var level = msg.TryGetProperty("level", out var levelEl) ? levelEl.GetString() : null;
                if (!string.Equals(level, "error", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                var text = msg.TryGetProperty("text", out var textEl) ? textEl.GetString()?.Trim() : null;
                if (string.IsNullOrEmpty(text))
                {
                    continue;
                }

                AccumulateBucket(messageCounts, text, url);
            }
        }
        catch (JsonException)
        {
            // ignore malformed browser payload
        }
    }

    private static void AccumulatePageErrors(
        IReadOnlyDictionary<string, object?> pageAnalysis,
        string url,
        Dictionary<string, MessageBucket> exceptionCounts)
    {
        if (!TryGetBrowserJson(pageAnalysis, out var browserJson))
        {
            return;
        }

        try
        {
            using var doc = JsonDocument.Parse(browserJson);
            if (!doc.RootElement.TryGetProperty("page_errors", out var pageErrors)
                || pageErrors.ValueKind != JsonValueKind.Array)
            {
                return;
            }

            foreach (var err in pageErrors.EnumerateArray())
            {
                if (err.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }

                var text = err.TryGetProperty("message", out var messageEl) ? messageEl.GetString()?.Trim() : null;
                if (string.IsNullOrEmpty(text))
                {
                    continue;
                }

                AccumulateBucket(exceptionCounts, text, url);
            }
        }
        catch (JsonException)
        {
            // ignore malformed browser payload
        }
    }

    private static void AccumulateBucket(
        Dictionary<string, MessageBucket> buckets,
        string text,
        string url)
    {
        if (!buckets.TryGetValue(text, out var bucket))
        {
            bucket = new MessageBucket { Text = text };
            buckets[text] = bucket;
        }

        bucket.Count++;
        if (!string.IsNullOrEmpty(url)
            && !bucket.SampleUrls.Contains(url, StringComparer.Ordinal)
            && bucket.SampleUrls.Count < 3)
        {
            bucket.SampleUrls.Add(url);
        }
    }

    private static bool TryGetBrowserJson(
        IReadOnlyDictionary<string, object?> pageAnalysis,
        out string browserJson)
    {
        browserJson = "";
        if (!pageAnalysis.TryGetValue("browser", out var browserRaw)
            || browserRaw is not string raw
            || string.IsNullOrWhiteSpace(raw))
        {
            return false;
        }

        browserJson = raw;
        return true;
    }
}
