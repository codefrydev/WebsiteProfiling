using ReportService.Application.Build;
using ReportService.Application.Build.Categories;

namespace ReportService.Tests;

public sealed class SearchPerformanceCategoryBuilderTests
{
    [Fact]
    public void Build_returns_null_without_gsc_impressions()
    {
        var google = new Dictionary<string, object?>
        {
            ["gsc"] = new Dictionary<string, object?>
            {
                ["summary"] = new Dictionary<string, object?> { ["impressions"] = 0 },
            },
        };

        Assert.Null(SearchPerformanceCategoryBuilder.Build(google));
    }

    [Fact]
    public void Build_scores_page_one_high_opportunity_queries()
    {
        var google = new Dictionary<string, object?>
        {
            ["gsc"] = new Dictionary<string, object?>
            {
                ["summary"] = new Dictionary<string, object?>
                {
                    ["impressions"] = 1000,
                    ["position"] = 5.0,
                    ["ctr"] = 4.0,
                },
                ["top_queries"] = new List<object?>
                {
                    new Dictionary<string, object?>
                    {
                        ["query"] = "widgets",
                        ["position"] = 8.0,
                        ["impressions"] = 120,
                        ["clicks"] = 2,
                    },
                },
                ["daily"] = new List<object?>(),
            },
        };

        var category = SearchPerformanceCategoryBuilder.Build(google);

        Assert.NotNull(category);
        Assert.Contains(category!.Issues, i => i.Message.Contains("positions 4–10", StringComparison.Ordinal));
    }

    [Fact]
    public void Build_scores_page_two_position_issue()
    {
        var google = new Dictionary<string, object?>
        {
            ["gsc"] = new Dictionary<string, object?>
            {
                ["summary"] = new Dictionary<string, object?>
                {
                    ["impressions"] = 1000,
                    ["position"] = 15.2,
                    ["ctr"] = 2.5,
                },
                ["top_queries"] = new List<object?>(),
                ["daily"] = new List<object?>(),
            },
        };

        var category = SearchPerformanceCategoryBuilder.Build(google);

        Assert.NotNull(category);
        Assert.Equal("search_performance", category!.Id);
        Assert.True(category.Score < 100);
        Assert.Contains(category.Issues, i => i.Message.Contains("page 2", StringComparison.OrdinalIgnoreCase));
    }
}

public sealed class IssueImpactEnricherTests
{
    [Fact]
    public void Enrich_adds_gsc_clicks_and_impact_score()
    {
        var google = new Dictionary<string, object?>
        {
            ["gsc"] = new Dictionary<string, object?>
            {
                ["top_pages"] = new List<object?>
                {
                    new Dictionary<string, object?>
                    {
                        ["page"] = "https://example.com/about",
                        ["clicks"] = 12,
                        ["impressions"] = 100,
                    },
                },
            },
        };
        var categories = new List<ReportCategory>
        {
            new("technical_seo", "Technical SEO", 90,
                [new CategoryIssue("Missing title", "https://example.com/about", "High", "Fix title")],
                []),
        };

        var enriched = IssueImpactEnricher.Enrich(categories, google);
        var issue = enriched[0].Issues[0];

        Assert.Equal(12, issue.GscClicks);
        Assert.Equal(100, issue.GscImpressions);
        Assert.True(issue.ImpactScore > 100);
    }

    [Fact]
    public void Enrich_does_not_match_partial_ga4_path_suffix()
    {
        var google = new Dictionary<string, object?>
        {
            ["ga4"] = new Dictionary<string, object?>
            {
                ["top_pages"] = new List<object?>
                {
                    new Dictionary<string, object?>
                    {
                        ["path"] = "/blog",
                        ["sessions"] = 500,
                    },
                },
            },
        };
        var categories = new List<ReportCategory>
        {
            new("technical_seo", "Technical SEO", 90,
                [new CategoryIssue("Issue", "https://example.com/news-blog", "High", "Fix")],
                []),
        };

        var enriched = IssueImpactEnricher.Enrich(categories, google);
        var issue = enriched[0].Issues[0];

        Assert.Equal(0, issue.Ga4Sessions);
    }
}
