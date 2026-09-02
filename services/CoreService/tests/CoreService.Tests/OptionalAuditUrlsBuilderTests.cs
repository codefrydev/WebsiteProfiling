using CoreService.Api.Application.Build;

namespace CoreService.Tests;

public sealed class OptionalAuditUrlsBuilderTests
{
    [Fact]
    public void Build_buckets_issues_by_message_heuristics()
    {
        var categories = new List<ReportCategory>
        {
            new(
                "technical_seo",
                "Technical SEO",
                90,
                [
                    new("2 page(s) have rel=prev without rel=next (pagination chain may be broken).", "", "Medium", ""),
                    new("HTML structure validation warnings: multiple title tags.", "https://example.com/a", "Low", ""),
                    new("AMP or amphtml variant missing canonical URL.", "https://example.com/amp", "Medium", ""),
                ],
                []),
            new(
                "intelligence",
                "Content quality",
                100,
                [new("Possible spelling issues (teh, wrng).", "https://example.com/b", "Low", "")],
                []),
        };

        var buckets = OptionalAuditUrlsBuilder.Build(categories);

        var pagination = Assert.IsType<List<Dictionary<string, object?>>>(buckets["pagination"]);
        var html = Assert.IsType<List<Dictionary<string, object?>>>(buckets["html"]);
        var amp = Assert.IsType<List<Dictionary<string, object?>>>(buckets["amp"]);
        var spell = Assert.IsType<List<Dictionary<string, object?>>>(buckets["spell"]);

        Assert.Single(pagination);
        Assert.Single(html);
        Assert.Single(amp);
        Assert.Single(spell);
    }
}
