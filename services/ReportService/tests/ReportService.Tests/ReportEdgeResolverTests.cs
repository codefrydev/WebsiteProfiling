using ReportService.Application.Build;
using ReportService.Application.Repositories;

namespace ReportService.Tests;

public sealed class ReportEdgeResolverTests
{
    [Fact]
    public void Resolve_prefers_plot_edges_table_over_crawl_columns()
    {
        var rows = new List<CrawlRow>
        {
            new() { Url = "https://example.com", OutlinkTargets = "https://example.com/about" },
        };
        var plotEdges = new List<(string From, string To)>
        {
            ("https://example.com", "https://example.com/blog"),
        };

        var resolved = ReportEdgeResolver.Resolve(rows, plotEdges, []);

        Assert.Single(resolved);
        Assert.Equal(plotEdges[0], resolved[0]);
    }

    [Fact]
    public void Resolve_falls_back_to_link_edges_then_crawl_columns()
    {
        var rows = new List<CrawlRow>
        {
            new() { Url = "https://example.com", OutlinkTargets = "https://example.com/about" },
        };
        var rich = new List<LinkEdgeRow>
        {
            new(
                "https://example.com",
                "https://example.com/services",
                "",
                "",
                false,
                false,
                false,
                "internal",
                "content"),
        };

        var fromRich = ReportEdgeResolver.Resolve(rows, [], rich);
        Assert.Single(fromRich);

        var fromCrawl = ReportEdgeResolver.Resolve(rows, [], []);
        Assert.Single(fromCrawl);
        Assert.Equal("https://example.com", fromCrawl[0].From);
    }
}
