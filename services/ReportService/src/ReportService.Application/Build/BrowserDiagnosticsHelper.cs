namespace ReportService.Application.Build;

/// <summary>Port of Python crawl/fetchers/browser_diagnostics.browser_summary_from_page_analysis.</summary>
public static class BrowserDiagnosticsHelper
{
    public static BrowserSummaryCounts SummaryFromPageAnalysis(IReadOnlyDictionary<string, object?> pageAnalysis)
    {
        var consoleErrors = 0;
        var pageErrors = 0;

        if (pageAnalysis.TryGetValue("browser", out var browserObj)
            && browserObj is string browserJson
            && TryGetBrowserSummary(browserJson, out var fromJson))
        {
            return fromJson;
        }

        if (pageAnalysis.TryGetValue("browser", out var browserRaw)
            && browserRaw is IReadOnlyDictionary<string, object?> browser
            && browser.TryGetValue("summary", out var summaryObj)
            && summaryObj is IReadOnlyDictionary<string, object?> summary)
        {
            consoleErrors = ToInt(summary.GetValueOrDefault("console_error_count"));
            pageErrors = ToInt(summary.GetValueOrDefault("page_error_count"));
        }

        return new BrowserSummaryCounts(consoleErrors, pageErrors);
    }

    private static bool TryGetBrowserSummary(string browserJson, out BrowserSummaryCounts counts)
    {
        counts = new BrowserSummaryCounts(0, 0);
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(browserJson);
            if (!doc.RootElement.TryGetProperty("summary", out var summary)
                || summary.ValueKind != System.Text.Json.JsonValueKind.Object)
            {
                return false;
            }

            counts = new BrowserSummaryCounts(
                summary.TryGetProperty("console_error_count", out var ce) && ce.TryGetInt32(out var cei) ? cei : 0,
                summary.TryGetProperty("page_error_count", out var pe) && pe.TryGetInt32(out var pei) ? pei : 0);
            return true;
        }
        catch (System.Text.Json.JsonException)
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
            string s when int.TryParse(s, out var parsed) => parsed,
            _ => 0,
        };

    public sealed record BrowserSummaryCounts(int ConsoleErrorCount, int PageErrorCount);
}
