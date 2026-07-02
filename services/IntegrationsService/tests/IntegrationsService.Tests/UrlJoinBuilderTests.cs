using IntegrationsService.Application.Google;

namespace IntegrationsService.Tests;

public sealed class UrlJoinBuilderTests
{
    [Theory]
    [InlineData("https://WWW.Example.com/page/", "example.com/page/")]
    [InlineData("https://example.com", "example.com/")]
    [InlineData("https://example.com/blog/post/", "example.com/blog/post/")]
    public void NormalizeUrl_strips_scheme_and_www(string input, string expected)
    {
        Assert.Equal(expected, UrlJoinBuilder.NormalizeUrl(input));
    }

    [Fact]
    public void PathToUrl_uses_start_url_origin()
    {
        Assert.Equal(
            "https://www.example.com/blog/post",
            UrlJoinBuilder.PathToUrl("/blog/post", "https://www.example.com/"));
    }

    [Fact]
    public void ComputeUrlJoin_counts_gaps_and_caps_lists()
    {
        var result = UrlJoinBuilder.ComputeUrlJoin(
            crawlUrls: ["https://example.com/a", "https://example.com/only-crawl"],
            gscPages: ["https://example.com/a", "https://example.com/only-gsc"],
            ga4Paths: ["/a", "/only-ga4"],
            startUrl: "https://example.com",
            gscByPage: new Dictionary<string, JsonElementMetrics>
            {
                ["https://example.com/only-gsc"] = new() { Clicks = 1, Impressions = 50 },
            },
            ga4ByPath: new Dictionary<string, JsonElementMetrics>
            {
                ["/only-ga4"] = new() { Sessions = 10 },
            },
            listLimit: 1);

        Assert.Equal(1, result.Matched);
        Assert.Equal(1, result.CrawlOnly);
        Assert.Equal(1, result.GscOnly);
        Assert.Equal(1, result.Ga4Only);
        Assert.Single(result.Lists.CrawlOnly);
        Assert.Single(result.Lists.GscOnly);
        Assert.Single(result.Lists.Ga4Only);
        Assert.Equal(1, result.ListsTotal.CrawlOnly);
        Assert.Equal(1, result.ListsTotal.GscOnly);
        Assert.Equal(1, result.ListsTotal.Ga4Only);
        Assert.Equal(1, result.ListLimit);
    }
}
