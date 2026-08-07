using System.Text.Json;
using ReportService.Application.Build;
using ReportService.Application.Repositories;

namespace ReportService.Tests;

public sealed class ContentAnalyticsBuilderTests
{
    [Fact]
    public void BuildContentAnalytics_empty_and_non_success()
    {
        Assert.Equal(0, ContentAnalyticsBuilder.BuildContentAnalytics([])["word_count_stats"] is Dictionary<string, object?> stats
            ? Convert.ToDouble(stats["mean"])
            : -1);

        var rows = new List<CrawlRow>
        {
            new() { Url = "https://example.com/x", Status = "404", WordCount = 100 },
        };
        Assert.Equal(0, ContentAnalyticsBuilder.BuildContentAnalytics(rows)["word_count_stats"] is Dictionary<string, object?> s2
            ? Convert.ToDouble(s2["mean"])
            : -1);
    }

    [Fact]
    public void BuildContentAnalytics_thin_pages_and_keywords()
    {
        var rows = new List<CrawlRow>
        {
            new()
            {
                Url = "https://example.com/thin",
                Status = "200",
                WordCount = 50,
                TopKeywords = """[{"word": "seo", "count": 3}]""",
            },
        };

        var content = ContentAnalyticsBuilder.BuildContentAnalytics(rows);
        var thin = Assert.IsType<List<Dictionary<string, object?>>>(content["thin_pages"]);
        Assert.Single(thin);
        Assert.Equal("https://example.com/thin", thin[0]["url"]);

        var keywords = Assert.IsType<List<Dictionary<string, object?>>>(content["top_keywords_site"]);
        Assert.Single(keywords);
        Assert.Equal("seo", keywords[0]["word"]);
    }

    [Fact]
    public void ParseTopKeywordsItems_parses_valid_json()
    {
        var items = ContentAnalyticsBuilder.ParseTopKeywordsItems("""[{"word": "x", "count": 2}]""");
        Assert.Single(items);
        Assert.Equal("x", items[0]["word"]);
    }

    [Fact]
    public void BuildDepthDistribution_counts_by_depth()
    {
        var rows = new List<CrawlRow>
        {
            new() { Url = "https://a.com/", Status = "200", Depth = 0 },
            new() { Url = "https://a.com/p", Status = "200", Depth = 2 },
            new() { Url = "https://a.com/q", Status = "200", Depth = 2 },
        };

        var depth = ContentAnalyticsBuilder.BuildDepthDistribution(rows);
        Assert.Equal(2, depth["max_depth"]);
        var byDepth = Assert.IsType<Dictionary<string, int>>(depth["by_depth"]);
        Assert.Equal(2, byDepth["2"]);
    }

    [Fact]
    public void ValidateContentAnalyticsThinPages_flags_mismatch()
    {
        var native = new Dictionary<string, object?>
        {
            ["thin_pages"] = new List<Dictionary<string, object?>> { new() { ["url"] = "a" } },
        };
        using var doc = JsonDocument.Parse("""{"content_analytics": {"thin_pages": []}}""");
        var warnings = ReportNativeValidator.ValidateContentAnalyticsThinPages(native, doc.RootElement);
        Assert.Single(warnings);
    }

    [Fact]
    public void BuildTechStackSummary_includes_homepage_and_static_note()
    {
        var rows = new List<CrawlRow>
        {
            new()
            {
                Url = "https://codefrydev.in/",
                Status = "200",
                ContentType = "text/html",
                TechStack = """["Hugo", "Google Tag Manager"]""",
            },
            new()
            {
                Url = "https://codefrydev.in/about/",
                Status = "200",
                ContentType = "text/html",
                TechStack = """["React"]""",
            },
        };

        var summary = ContentAnalyticsBuilder.BuildTechStackSummary(
            rows,
            "https://codefrydev.in",
            "static");

        Assert.Equal(2, summary["total_pages_analyzed"]);
        Assert.Equal("https://codefrydev.in/", summary["homepage_url"]);
        var homepage = Assert.IsType<List<Dictionary<string, object?>>>(summary["homepage_technologies"]);
        Assert.Equal(2, homepage.Count);
        var notes = Assert.IsType<List<string>>(summary["detection_notes"]);
        Assert.Contains("static_crawl", notes);
    }
}
