using System.Text.Json;

namespace ReportService.Application.Build;

/// <summary>Port of Python crawl/fetchers/browser_diagnostics.browser_summary_from_page_analysis.</summary>
public static class BrowserDiagnosticsHelper
{
    public static BrowserSummaryCounts SummaryFromPageAnalysis(IReadOnlyDictionary<string, object?> pageAnalysis)
    {
        if (!pageAnalysis.TryGetValue("browser", out var browserObj) || browserObj is null)
        {
            return new BrowserSummaryCounts(0, 0, 0);
        }

        if (TryCountFromBrowser(browserObj, out var counts))
        {
            return counts;
        }

        return new BrowserSummaryCounts(0, 0, 0);
    }

    private static bool TryCountFromBrowser(object browserObj, out BrowserSummaryCounts counts)
    {
        counts = new BrowserSummaryCounts(0, 0, 0);

        if (browserObj is JsonElement browserEl && browserEl.ValueKind == JsonValueKind.Object)
        {
            return TryCountFromBrowserElement(browserEl, out counts);
        }

        if (browserObj is IReadOnlyDictionary<string, object?> browserDict)
        {
            return TryCountFromBrowserDictionary(browserDict, out counts);
        }

        if (browserObj is string browserJson)
        {
            try
            {
                using var doc = JsonDocument.Parse(browserJson);
                if (doc.RootElement.ValueKind == JsonValueKind.Object)
                {
                    return TryCountFromBrowserElement(doc.RootElement, out counts);
                }
            }
            catch (JsonException)
            {
                return false;
            }
        }

        return false;
    }

    private static bool TryCountFromBrowserDictionary(
        IReadOnlyDictionary<string, object?> browser,
        out BrowserSummaryCounts counts)
    {
        counts = new BrowserSummaryCounts(0, 0, 0);
        var hasArrayData = false;
        var consoleErrors = 0;
        var pageErrors = 0;
        var failedRequests = 0;

        if (browser.TryGetValue("console", out var consoleObj))
        {
            consoleErrors = CountConsoleErrors(consoleObj);
            hasArrayData = true;
        }

        if (browser.TryGetValue("page_errors", out var pageErrorsObj))
        {
            pageErrors = CountArrayItems(pageErrorsObj);
            hasArrayData = true;
        }

        if (browser.TryGetValue("failed_requests", out var failedRequestsObj))
        {
            failedRequests = CountArrayItems(failedRequestsObj);
            hasArrayData = true;
        }

        if (hasArrayData)
        {
            counts = new BrowserSummaryCounts(consoleErrors, pageErrors, failedRequests);
            return true;
        }

        if (browser.TryGetValue("summary", out var summaryObj))
        {
            counts = ReadSummaryObject(summaryObj);
            return true;
        }

        return false;
    }

    private static bool TryCountFromBrowserElement(JsonElement browser, out BrowserSummaryCounts counts)
    {
        counts = new BrowserSummaryCounts(0, 0, 0);
        var hasArrayData = false;
        var consoleErrors = 0;
        var pageErrors = 0;
        var failedRequests = 0;

        if (browser.TryGetProperty("console", out var consoleEl) && consoleEl.ValueKind == JsonValueKind.Array)
        {
            consoleErrors = CountConsoleErrors(consoleEl);
            hasArrayData = true;
        }

        if (browser.TryGetProperty("page_errors", out var pageErrorsEl) && pageErrorsEl.ValueKind == JsonValueKind.Array)
        {
            pageErrors = pageErrorsEl.GetArrayLength();
            hasArrayData = true;
        }

        if (browser.TryGetProperty("failed_requests", out var failedRequestsEl)
            && failedRequestsEl.ValueKind == JsonValueKind.Array)
        {
            failedRequests = failedRequestsEl.GetArrayLength();
            hasArrayData = true;
        }

        if (hasArrayData)
        {
            counts = new BrowserSummaryCounts(consoleErrors, pageErrors, failedRequests);
            return true;
        }

        if (browser.TryGetProperty("summary", out var summaryEl))
        {
            counts = ReadSummaryElement(summaryEl);
            return true;
        }

        return false;
    }

    private static int CountConsoleErrors(object? consoleObj) =>
        consoleObj switch
        {
            JsonElement { ValueKind: JsonValueKind.Array } consoleEl => CountConsoleErrors(consoleEl),
            IEnumerable<object?> items => items.Count(IsConsoleErrorObject),
            _ => 0,
        };

    private static int CountConsoleErrors(JsonElement console)
    {
        var count = 0;
        foreach (var msg in console.EnumerateArray())
        {
            if (msg.ValueKind != JsonValueKind.Object)
            {
                continue;
            }

            var level = msg.TryGetProperty("level", out var levelEl) ? levelEl.GetString() : null;
            if (string.Equals(level, "error", StringComparison.OrdinalIgnoreCase))
            {
                count++;
            }
        }

        return count;
    }

    private static bool IsConsoleErrorObject(object? item)
    {
        if (item is JsonElement el && el.ValueKind == JsonValueKind.Object)
        {
            var level = el.TryGetProperty("level", out var levelEl) ? levelEl.GetString() : null;
            return string.Equals(level, "error", StringComparison.OrdinalIgnoreCase);
        }

        if (item is IReadOnlyDictionary<string, object?> dict)
        {
            var level = dict.GetValueOrDefault("level")?.ToString();
            return string.Equals(level, "error", StringComparison.OrdinalIgnoreCase);
        }

        return false;
    }

    private static int CountArrayItems(object? arrayObj) =>
        arrayObj switch
        {
            JsonElement { ValueKind: JsonValueKind.Array } el => el.GetArrayLength(),
            IEnumerable<object?> items => items.Count(),
            _ => 0,
        };

    private static BrowserSummaryCounts ReadSummaryElement(JsonElement summary)
    {
        if (summary.ValueKind != JsonValueKind.Object)
        {
            return new BrowserSummaryCounts(0, 0, 0);
        }

        return new BrowserSummaryCounts(
            summary.TryGetProperty("console_error_count", out var ce) && ce.TryGetInt32(out var cei) ? cei : 0,
            summary.TryGetProperty("page_error_count", out var pe) && pe.TryGetInt32(out var pei) ? pei : 0,
            summary.TryGetProperty("failed_request_count", out var fr) && fr.TryGetInt32(out var fri) ? fri : 0);
    }

    private static BrowserSummaryCounts ReadSummaryObject(object? summaryObj) =>
        summaryObj switch
        {
            JsonElement el => ReadSummaryElement(el),
            IReadOnlyDictionary<string, object?> summary => new BrowserSummaryCounts(
                ToInt(summary.GetValueOrDefault("console_error_count")),
                ToInt(summary.GetValueOrDefault("page_error_count")),
                ToInt(summary.GetValueOrDefault("failed_request_count"))),
            _ => new BrowserSummaryCounts(0, 0, 0),
        };

    private static int ToInt(object? value) =>
        value switch
        {
            int i => i,
            long l => (int)l,
            double d => (int)d,
            JsonElement { ValueKind: JsonValueKind.Number } el when el.TryGetInt32(out var n) => n,
            JsonElement { ValueKind: JsonValueKind.String } el
                when int.TryParse(el.GetString(), out var parsed) => parsed,
            string s when int.TryParse(s, out var parsed) => parsed,
            _ => 0,
        };

    public sealed record BrowserSummaryCounts(
        int ConsoleErrorCount,
        int PageErrorCount,
        int FailedRequestCount = 0);
}
