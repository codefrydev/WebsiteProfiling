using System.Text.Json;
using ReportService.Application.Build;

namespace ReportService.Tests;

public sealed class BrowserDiagnosticsHelperTests
{
    [Fact]
    public void SummaryFromPageAnalysis_reads_nested_dict_browser()
    {
        var pageAnalysis = new Dictionary<string, object?>
        {
            ["browser"] = new Dictionary<string, object?>
            {
                ["summary"] = new Dictionary<string, object?>
                {
                    ["console_error_count"] = 3,
                    ["page_error_count"] = 1,
                },
            },
        };

        var counts = BrowserDiagnosticsHelper.SummaryFromPageAnalysis(pageAnalysis);
        Assert.Equal(3, counts.ConsoleErrorCount);
        Assert.Equal(1, counts.PageErrorCount);
    }

    [Fact]
    public void SummaryFromPageAnalysis_reads_materialized_json_element_summary()
    {
        using var doc = JsonDocument.Parse(
            """
            {
              "browser": {
                "summary": {
                  "console_error_count": 9,
                  "page_error_count": 0
                }
              }
            }
            """);
        var pageAnalysis = new Dictionary<string, object?>
        {
            ["browser"] = JsonSerializer.Deserialize<Dictionary<string, object?>>(
                doc.RootElement.GetProperty("browser").GetRawText()),
        };

        var counts = BrowserDiagnosticsHelper.SummaryFromPageAnalysis(pageAnalysis);
        Assert.Equal(9, counts.ConsoleErrorCount);
        Assert.Equal(0, counts.PageErrorCount);
    }

    [Fact]
    public void SummaryFromPageAnalysis_reads_browser_json_string()
    {
        var pageAnalysis = new Dictionary<string, object?>
        {
            ["browser"] = """{"summary":{"console_error_count":2,"page_error_count":1}}""",
        };

        var counts = BrowserDiagnosticsHelper.SummaryFromPageAnalysis(pageAnalysis);
        Assert.Equal(2, counts.ConsoleErrorCount);
        Assert.Equal(1, counts.PageErrorCount);
    }
}
