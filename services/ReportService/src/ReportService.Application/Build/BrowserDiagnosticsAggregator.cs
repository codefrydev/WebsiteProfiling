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
        var totalConsoleErrors = 0;
        var totalPageErrors = 0;
        var messageCounts = new Dictionary<string, MessageBucket>(StringComparer.Ordinal);

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

            AccumulateConsoleMessages(pa, url, messageCounts);
        }

        if (pagesWithConsoleErrors == 0
            && pagesWithPageErrors == 0
            && totalConsoleErrors == 0
            && totalPageErrors == 0)
        {
            return null;
        }

        var topConsoleMessages = messageCounts.Values
            .OrderByDescending(b => b.Count)
            .Take(5)
            .Select(b => (Dictionary<string, object?>)new Dictionary<string, object?>
            {
                ["text"] = b.Text,
                ["count"] = b.Count,
                ["sample_urls"] = b.SampleUrls,
            })
            .ToList();

        return new Dictionary<string, object?>
        {
            ["pages_with_console_errors"] = pagesWithConsoleErrors,
            ["pages_with_page_errors"] = pagesWithPageErrors,
            ["total_console_errors"] = totalConsoleErrors,
            ["total_page_errors"] = totalPageErrors,
            ["top_console_messages"] = topConsoleMessages,
        };
    }

    private static void AccumulateConsoleMessages(
        IReadOnlyDictionary<string, object?> pageAnalysis,
        string url,
        Dictionary<string, MessageBucket> messageCounts)
    {
        if (!pageAnalysis.TryGetValue("browser", out var browserRaw)
            || browserRaw is not string browserJson
            || string.IsNullOrWhiteSpace(browserJson))
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

                if (!messageCounts.TryGetValue(text, out var bucket))
                {
                    bucket = new MessageBucket { Text = text };
                    messageCounts[text] = bucket;
                }

                bucket.Count++;
                if (!string.IsNullOrEmpty(url)
                    && !bucket.SampleUrls.Contains(url, StringComparer.Ordinal)
                    && bucket.SampleUrls.Count < 3)
                {
                    bucket.SampleUrls.Add(url);
                }
            }
        }
        catch (JsonException)
        {
            // ignore malformed browser payload
        }
    }
}
