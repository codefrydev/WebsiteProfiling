using CoreService.Api.Application.Build;
using CoreService.Api.Application.Repositories;

namespace CoreService.Tests;

public sealed class ReportGraphBuilderTests
{
    [Fact]
    public void Build_with_edges_produces_top_pages_and_graph()
    {
        var rows = new List<CrawlRow>
        {
            new() { Url = "https://example.com/", Title = "Home", Outlinks = 2 },
            new() { Url = "https://example.com/about", Title = "About", Outlinks = 0 },
        };
        var edges = new List<(string From, string To)>
        {
            ("https://example.com/", "https://example.com/about"),
            ("https://example.com/about", "https://example.com/"),
        };

        var graph = ReportGraphBuilder.Build(rows, edges, maxNodesPlot: 50);

        Assert.NotEmpty(graph.TopPages);
        Assert.Equal(2, graph.TopPages.Count);
        Assert.Contains(graph.GraphNodes, n => n == "https://example.com/");
        Assert.NotEmpty(graph.GraphEdges);
    }

    [Fact]
    public void Build_without_edges_falls_back_to_outlinks()
    {
        var rows = new List<CrawlRow>
        {
            new() { Url = "https://example.com/a", Title = "A", Outlinks = 10 },
            new() { Url = "https://example.com/b", Title = "B", Outlinks = 1 },
        };

        var graph = ReportGraphBuilder.Build(rows, [], maxNodesPlot: 50);

        Assert.Empty(graph.GraphNodes);
        Assert.Empty(graph.GraphEdges);
        Assert.Equal("https://example.com/a", graph.TopPages[0]["url"]);
    }
}
