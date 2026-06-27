using ReportService.Application.Build;
using ReportService.Application.Repositories;

namespace ReportService.Tests;

public sealed class CrawlSegmentsBuilderTests
{
    [Fact]
    public void Build_groups_by_prefix_and_scores_health()
    {
        var rows = new List<CrawlRow>
        {
            new() { Url = "https://example.com/blog/a", Status = "200", Title = "A", MetaDescription = "d", ViewportPresent = true },
            new() { Url = "https://example.com/blog/b", Status = "404", Title = "", MetaDescription = "", ViewportPresent = false },
            new() { Url = "https://example.com/about", Status = "200", Title = "About", MetaDescription = "d", ViewportPresent = true },
        };

        var categories = new List<ReportCategory>
        {
            new("technical_seo", "Technical SEO", 80, [], []),
            new("intelligence", "Content", 60, [], []),
        };

        var outDict = CrawlSegmentsBuilder.Build(rows, categories, ["/blog"]);
        Assert.NotNull(outDict);
        Assert.Equal(70, outDict!["overall_health"]);

        var segments = Assert.IsType<List<Dictionary<string, object?>>>(outDict["segments"]);
        Assert.Single(segments);
        Assert.Equal("/blog", segments[0]["prefix"]);
        Assert.Equal(2, segments[0]["url_count"]);
        Assert.Equal("prefix", segments[0]["pattern_type"]);
        Assert.True(Convert.ToInt32(segments[0]["health_score"]) < 100);
    }

    [Fact]
    public void IsRegexPattern_detects_regex_metacharacters()
    {
        Assert.False(CrawlSegmentsBuilder.IsRegexPattern("/blog"));
        Assert.True(CrawlSegmentsBuilder.IsRegexPattern("/blog/.*"));
        Assert.False(CrawlSegmentsBuilder.IsRegexPattern("/api/v1.0"));
    }

    [Fact]
    public void Build_returns_null_for_empty_prefixes()
    {
        Assert.Null(CrawlSegmentsBuilder.Build([], [], []));
    }
}
