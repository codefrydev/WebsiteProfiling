using CoreService.Api.Application.Build;

namespace CoreService.Tests;

public sealed class ReportSiteHealthScoreBuilderTests
{
    [Fact]
    public void Compute_excludes_search_performance_and_intelligence()
    {
        var categories = new List<ReportCategory>
        {
            new("technical_seo", "Technical SEO", 80, [], []),
            new("link_health", "Link Health", 80, [], []),
            new("performance", "Performance", 80, [], []),
            new("security", "Security", 80, [], []),
            new("core_web_vitals", "Core Web Vitals", 80, [], []),
            new("mobile", "Mobile", 80, [], []),
            new("html_accessibility", "Accessibility", 80, [], []),
            new("search_performance", "Search performance", 20, [], []),
            new("intelligence", "Intelligence", 50, [], []),
        };

        var score = SiteHealthScoreBuilder.Compute(categories);

        Assert.Equal(80, score);
    }

    [Fact]
    public void Compute_normalizes_when_categories_missing()
    {
        var categories = new List<ReportCategory>
        {
            new("technical_seo", "Technical SEO", 100, [], []),
            new("link_health", "Link Health", 60, [], []),
        };

        var score = SiteHealthScoreBuilder.Compute(categories);

        // (100*0.25 + 60*0.20) / (0.25+0.20) = 82.22 -> 82
        Assert.Equal(82, score);
    }
}
