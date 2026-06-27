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
    public void Build_with_gsc_varies_difficulty_and_ctr()
    {
        var rows = Enumerable.Range(0, 100)
            .Select(i => new CrawlRow
            {
                Url = $"https://example.com/page-{i}",
                Status = "200",
                Title = "seo guide for beginners",
                H1 = "seo guide",
            })
            .ToList();

        var google = new Dictionary<string, object?>
        {
            ["gsc"] = new Dictionary<string, object?>
            {
                ["top_queries"] = new List<object?>
                {
                    new Dictionary<string, object?> { ["query"] = "seo guide", ["position"] = 8.0 },
                },
            },
        };

        var result = KeywordOpportunitiesBuilder.Build(rows, new Dictionary<string, string>(), google);
        var quickWins = Assert.IsType<List<Dictionary<string, object?>>>(result["quick_wins"]);

        Assert.NotEmpty(quickWins);
        var seoGuide = quickWins.FirstOrDefault(k => k["keyword"]?.ToString() == "seo guide");
        Assert.NotNull(seoGuide);
        Assert.NotEqual(50.0, Convert.ToDouble(seoGuide["difficulty"]));
        Assert.NotEqual(0.1, Convert.ToDouble(seoGuide["ctr_est"]));
        Assert.Equal(8.0, Convert.ToDouble(seoGuide["current_rank"]));
    }

    [Fact]
    public void Build_high_value_requires_volume_at_least_half()
    {
        var rows = Enumerable.Range(0, 10)
            .Select(i => new CrawlRow
            {
                Url = $"https://example.com/page-{i}",
                Status = "200",
                Title = "sharedkeyword page title here for length",
                H1 = "sharedkeyword",
            })
            .ToList();

        var result = KeywordOpportunitiesBuilder.Build(rows, new Dictionary<string, string>());
        var highValue = Assert.IsType<List<Dictionary<string, object?>>>(result["high_value"]);

        Assert.Contains(highValue, item =>
            item["keyword"]?.ToString() == "sharedkeyword"
            && Convert.ToDouble(item["volume"]) >= 0.5);
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
