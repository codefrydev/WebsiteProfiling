using ReportService.Application.Build;
using ReportService.Application.Repositories;

namespace ReportService.Tests;

public sealed class KeywordOpportunitiesBuilderTests
{
    [Fact]
    public void Build_returns_empty_when_disabled()
    {
        var rows = new List<CrawlRow>
        {
            new()
            {
                Url = "https://example.com/seo-guide",
                Status = "200",
                Title = "SEO guide",
                H1 = "SEO guide",
            },
        };

        var result = KeywordOpportunitiesBuilder.Build(
            rows,
            new Dictionary<string, string> { ["include_keyword_opportunities"] = "false" });

        Assert.Empty(result);
    }

    [Fact]
    public void Build_produces_quick_wins_and_clusters_for_success_rows()
    {
        var rows = new List<CrawlRow>
        {
            new()
            {
                Url = "https://example.com/seo-guide",
                Status = "200",
                Title = "SEO guide for beginners",
                MetaDescription = "Learn SEO guide basics",
                H1 = "SEO guide",
                TopKeywords = """[{"word":"seo","count":4},{"word":"guide","count":3}]""",
            },
            new()
            {
                Url = "https://example.com/seo-tools",
                Status = "200",
                Title = "SEO tools overview",
                H1 = "SEO tools",
                TopKeywords = """[{"word":"seo","count":2},{"word":"tools","count":2}]""",
            },
        };

        var result = KeywordOpportunitiesBuilder.Build(rows, new Dictionary<string, string>());

        var quickWins = Assert.IsType<List<Dictionary<string, object?>>>(result["quick_wins"]);
        var highValue = Assert.IsType<List<Dictionary<string, object?>>>(result["high_value"]);
        var clusters = Assert.IsType<List<Dictionary<string, object?>>>(result["token_topic_clusters"]);

        Assert.NotEmpty(quickWins);
        Assert.NotEmpty(highValue);
        Assert.NotEmpty(clusters);
        Assert.Contains(quickWins, item => item["keyword"]?.ToString()?.Contains("seo", StringComparison.Ordinal) == true);
    }

    [Fact]
    public void Build_filters_junk_heading_tokens()
    {
        var rows = new List<CrawlRow>
        {
            new()
            {
                Url = "https://example.com/page",
                Status = "200",
                Title = "h1 h2 h3",
                H1 = "h1",
            },
        };

        var result = KeywordOpportunitiesBuilder.Build(rows, new Dictionary<string, string>());
        var quickWins = Assert.IsType<List<Dictionary<string, object?>>>(result["quick_wins"]);

        Assert.DoesNotContain(quickWins, item => item["keyword"]?.ToString() == "h1");
    }
}
