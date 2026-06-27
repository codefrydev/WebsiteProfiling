using System.Text.Json;

namespace ReportService.Application.Build;

/// <summary>Port of Python crawl/fetchers/browser_diagnostics.browser_summary_from_page_analysis.</summary>
public static class BrowserDiagnosticsHelper
{
    public static BrowserSummaryCounts SummaryFromPageAnalysis(IReadOnlyDictionary<string, object?> pageAnalysis)
    {
        if (!pageAnalysis.TryGetValue("browser", out var browserObj) || browserObj is null)
        {
            return new BrowserSummaryCounts(0, 0);
        }

        if (browserObj is string browserJson && TryGetBrowserSummary(browserJson, out var fromJson))
        {
            return fromJson;
        }

        if (TryReadSummaryCounts(browserObj, out var counts))
        {
            return counts;
        }

        return new BrowserSummaryCounts(0, 0);
    }

    private static bool TryReadSummaryCounts(object browserObj, out BrowserSummaryCounts counts)
    {
        counts = new BrowserSummaryCounts(0, 0);

        if (browserObj is JsonElement browserEl)
        {
            if (browserEl.ValueKind != JsonValueKind.Object
                || !browserEl.TryGetProperty("summary", out var summaryEl))
            {
                return false;
            }

            counts = ReadSummaryElement(summaryEl);
            return true;
        }

        if (browserObj is IReadOnlyDictionary<string, object?> browser
            && browser.TryGetValue("summary", out var summaryObj))
        {
            counts = ReadSummaryObject(summaryObj);
            return true;
        }

        if (browserObj is string browserJson && TryGetBrowserSummary(browserJson, out counts))
        {
            return true;
        }

        return false;
    }

    private static BrowserSummaryCounts ReadSummaryElement(JsonElement summary)
    {
        if (summary.ValueKind != JsonValueKind.Object)
        {
            return new BrowserSummaryCounts(0, 0);
        }

        return new BrowserSummaryCounts(
            summary.TryGetProperty("console_error_count", out var ce) && ce.TryGetInt32(out var cei) ? cei : 0,
            summary.TryGetProperty("page_error_count", out var pe) && pe.TryGetInt32(out var pei) ? pei : 0);
    }

    private static BrowserSummaryCounts ReadSummaryObject(object? summaryObj) =>
        summaryObj switch
        {
            JsonElement el => ReadSummaryElement(el),
            IReadOnlyDictionary<string, object?> summary => new BrowserSummaryCounts(
                ToInt(summary.GetValueOrDefault("console_error_count")),
                ToInt(summary.GetValueOrDefault("page_error_count"))),
            _ => new BrowserSummaryCounts(0, 0),
        };

    private static bool TryGetBrowserSummary(string browserJson, out BrowserSummaryCounts counts)
    {
        counts = new BrowserSummaryCounts(0, 0);
        try
        {
            using var doc = JsonDocument.Parse(browserJson);
            if (!doc.RootElement.TryGetProperty("summary", out var summary)
                || summary.ValueKind != JsonValueKind.Object)
            {
                return false;
            }

            counts = ReadSummaryElement(summary);
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
    }

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

    public sealed record BrowserSummaryCounts(int ConsoleErrorCount, int PageErrorCount);
}
