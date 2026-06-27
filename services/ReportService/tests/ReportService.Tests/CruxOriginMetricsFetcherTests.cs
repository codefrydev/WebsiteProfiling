using System.Text.Json;
using ReportService.Application.Integrations;

namespace ReportService.Tests;

public sealed class CruxOriginMetricsFetcherTests
{
    [Fact]
    public void ParseRecord_marks_failing_metrics_and_passing_cls()
    {
        const string json = """
            {
              "record": {
                "metrics": {
                  "largest_contentful_paint": {"percentiles": {"p75": 3000}},
                  "interaction_to_next_paint": {"percentiles": {"p75": 250}},
                  "cumulative_layout_shift": {"percentiles": {"p75": "0.05"}}
                }
              }
            }
            """;

        using var doc = JsonDocument.Parse(json);
        var parsed = CruxOriginMetricsFetcher.ParseRecord("https://example.com", doc.RootElement);

        Assert.True(parsed["ok"] is true);
        var pass = Assert.IsType<Dictionary<string, object?>>(parsed["pass"]);
        Assert.Equal(false, pass["lcp"]);
        Assert.Equal(false, pass["inp"]);
        Assert.Equal(true, pass["cls"]);
    }
}
