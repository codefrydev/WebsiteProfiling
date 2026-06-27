using System.Text.Json.Nodes;
using ReportService.Application.Build;

namespace ReportService.Tests;

public sealed class LighthouseReportMergeTests
{
    [Fact]
    public void FilterLighthouseByHost_keeps_matching_hosts_www_tolerant()
    {
        var byUrl = new Dictionary<string, JsonNode>
        {
            ["https://www.example.com/"] = JsonNode.Parse("""{"url":"https://www.example.com/"}""")!,
            ["https://other.test/"] = JsonNode.Parse("""{"url":"https://other.test/"}""")!,
        };

        var filtered = LighthouseReportMerge.FilterLighthouseByHost(byUrl, "example.com");
        Assert.Single(filtered);
        Assert.True(filtered.ContainsKey("https://www.example.com/"));
    }

    [Fact]
    public void LighthouseForUrl_is_trailing_slash_tolerant()
    {
        var byUrl = new Dictionary<string, JsonNode>
        {
            ["https://example.com/page"] = JsonNode.Parse("""{"score":90}""")!,
        };

        var match = LighthouseReportMerge.LighthouseForUrl(byUrl, "https://example.com/page/");
        Assert.NotNull(match);
    }

    [Fact]
    public void EdgesBuilder_parses_serialized_outlinks()
    {
        var rows = new[]
        {
            new CrawlRowEdgesInput(
                "https://example.com/",
                new Dictionary<string, string> { ["outlink_targets"] = "https://example.com/a, https://example.com/b" }),
        };

        var edges = EdgesBuilder.BuildFromSerializedColumns(rows, sameDomainOnly: true);
        Assert.Equal(2, edges.Count);
    }
}
