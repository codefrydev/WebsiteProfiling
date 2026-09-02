using CoreService.Api.Application.Build;

namespace CoreService.Tests;

public sealed class LinkEdgesReportBuilderTests
{
    [Fact]
    public void SummarizeLinkRel_counts_internal_rel_flags()
    {
        var edges = new List<Dictionary<string, object?>>
        {
            new()
            {
                ["link_type"] = "internal",
                ["is_nofollow"] = true,
                ["is_sponsored"] = false,
                ["is_ugc"] = false,
            },
            new()
            {
                ["link_type"] = "internal",
                ["is_nofollow"] = false,
                ["is_sponsored"] = true,
                ["is_ugc"] = false,
            },
            new() { ["link_type"] = "external" },
        };

        var summary = LinkEdgesReportBuilder.SummarizeLinkRel(edges);

        Assert.Equal(3, summary["total_edges"]);
        Assert.Equal(2, summary["internal_edges"]);
        Assert.Equal(1, summary["nofollow_internal"]);
        Assert.Equal(1, summary["sponsored_internal"]);
        Assert.Equal(1, summary["external_edges"]);
    }

    [Fact]
    public void BuildInlinkAnchorMatrix_aggregates_by_target_and_anchor()
    {
        var edges = new List<Dictionary<string, object?>>
        {
            new()
            {
                ["link_type"] = "internal",
                ["from_url"] = "https://example.com/",
                ["to_url"] = "https://example.com/about",
                ["anchor_text"] = "About us",
                ["position"] = "nav",
            },
            new()
            {
                ["link_type"] = "internal",
                ["from_url"] = "https://example.com/blog",
                ["to_url"] = "https://example.com/about",
                ["anchor_text"] = "About us",
                ["position"] = "content",
            },
        };

        var matrix = LinkEdgesReportBuilder.BuildInlinkAnchorMatrix(edges);

        Assert.Single(matrix);
        Assert.Equal(2, matrix[0]["inlink_count"]);
        Assert.Equal("https://example.com/about", matrix[0]["target_url"]);
    }
}
