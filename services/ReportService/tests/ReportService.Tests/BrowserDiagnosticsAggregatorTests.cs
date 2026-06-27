using System.Text.Json;
using ReportService.Application.Build;
using ReportService.Application.Repositories;

namespace ReportService.Tests;

public sealed class BrowserDiagnosticsAggregatorTests
{
    [Fact]
    public void Aggregate_counts_pages_messages_and_top_console()
    {
        var paWithError = """
            {
              "browser": {
                "console": [{"level": "error", "text": "Same error"}],
                "page_errors": [{"message": "Uncaught"}],
                "summary": {"console_error_count": 1, "page_error_count": 1}
              }
            }
            """;
        var paClean = """{"browser": {"console": [], "summary": {"console_error_count": 0, "page_error_count": 0}}}""";

        var rows = new List<CrawlRow>
        {
            new() { Url = "https://a.com/1", Status = "200", PageAnalysisJson = paWithError },
            new() { Url = "https://a.com/2", Status = "200", PageAnalysisJson = paWithError },
            new() { Url = "https://a.com/3", Status = "200", PageAnalysisJson = paClean },
        };

        var agg = BrowserDiagnosticsAggregator.Aggregate(rows);
        Assert.NotNull(agg);
        Assert.Equal(2, agg["pages_with_console_errors"]);
        Assert.Equal(2, agg["total_console_errors"]);
        Assert.Equal(2, agg["pages_with_page_errors"]);
        Assert.Equal(2, agg["total_page_errors"]);

        var top = Assert.IsType<List<Dictionary<string, object?>>>(agg["top_console_messages"]);
        Assert.NotEmpty(top);
        Assert.Equal("Same error", top[0]["text"]);
        Assert.Equal(2, top[0]["count"]);
    }

    [Fact]
    public void Aggregate_returns_null_when_no_diagnostics()
    {
        var rows = new List<CrawlRow>
        {
            new() { Url = "https://a.com/", Status = "200", PageAnalysisJson = "{}" },
        };

        Assert.Null(BrowserDiagnosticsAggregator.Aggregate(rows));
    }
}

public sealed class ReportMetadataBrowserDiagnosticsTests
{
    [Fact]
    public void BuildReportMetadata_writes_browser_diagnostics_for_js_render_mode()
    {
        var pa = """
            {
              "browser": {
                "console": [{"level": "error", "text": "TypeError"}],
                "summary": {"console_error_count": 1, "page_error_count": 0}
              }
            }
            """;
        var rows = new List<CrawlRow>
        {
            new() { Url = "https://a.com/", Status = "200", FetchMethod = "rendered", PageAnalysisJson = pa },
        };

        var meta = ReportMetadataBuilder.BuildReportMetadata(
            rows,
            new Dictionary<string, string> { ["crawl_render_mode"] = "javascript" },
            null,
            null,
            null,
            null,
            null,
            null);

        var scope = Assert.IsType<Dictionary<string, object?>>(meta["crawl_scope"]);
        var bd = Assert.IsType<Dictionary<string, object?>>(scope["browser_diagnostics"]);
        Assert.Equal(1, bd["pages_with_console_errors"]);
    }

    [Fact]
    public void BuildReportMetadata_omits_browser_diagnostics_for_static_without_console_errors()
    {
        var pa = """
            {
              "browser": {
                "page_errors": [{"message": "Uncaught"}],
                "summary": {"console_error_count": 0, "page_error_count": 1}
              }
            }
            """;
        var rows = new List<CrawlRow>
        {
            new() { Url = "https://a.com/", Status = "200", PageAnalysisJson = pa },
        };

        var meta = ReportMetadataBuilder.BuildReportMetadata(
            rows,
            new Dictionary<string, string> { ["crawl_render_mode"] = "static" },
            null,
            null,
            null,
            null,
            null,
            null);

        var scope = Assert.IsType<Dictionary<string, object?>>(meta["crawl_scope"]);
        Assert.False(scope.ContainsKey("browser_diagnostics"));
    }
}
