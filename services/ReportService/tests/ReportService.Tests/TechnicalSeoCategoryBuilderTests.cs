using ReportService.Application.Build.Categories;
using ReportService.Application.Repositories;

namespace ReportService.Tests;

public sealed class TechnicalSeoCategoryBuilderTests
{
    [Fact]
    public void Build_html_lang_missing_many_pages()
    {
        var rows = Enumerable.Range(0, 4)
            .Select(i => new CrawlRow
            {
                Url = $"https://example.com/{i}",
                Status = "200",
                PageAnalysisJson = i < 2 ? """{"html_lang":""}""" : """{"html_lang":"en"}""",
            })
            .ToList();

        var cat = TechnicalSeoCategoryBuilder.Build(rows, new Dictionary<string, object?>());
        Assert.Contains(cat.Issues, i => i.Message.Contains("<html lang>", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void Build_browser_console_and_page_errors()
    {
        var rows = new List<CrawlRow>
        {
            new()
            {
                Url = "https://example.com/console",
                Status = "200",
                PageAnalysisJson = """{"browser":{"summary":{"console_error_count":1,"page_error_count":0}}}""",
            },
            new()
            {
                Url = "https://example.com/js-error",
                Status = "200",
                PageAnalysisJson = """{"browser":{"summary":{"console_error_count":0,"page_error_count":2}}}""",
            },
        };

        var cat = TechnicalSeoCategoryBuilder.Build(rows, new Dictionary<string, object?>());
        var msgs = string.Join(" ", cat.Issues.Select(i => i.Message)).ToLowerInvariant();
        Assert.Contains("console errors", msgs);
        Assert.Contains("javascript error", msgs);
    }

    [Fact]
    public void Build_site_level_issues_without_success_rows()
    {
        var rows = new List<CrawlRow>
        {
            new() { Url = "https://example.com/old", Status = "404" },
        };
        var siteLevel = new Dictionary<string, object?>
        {
            ["robots_present"] = false,
            ["sitemap_present"] = false,
        };

        var cat = TechnicalSeoCategoryBuilder.Build(rows, siteLevel);
        Assert.Equal(75, cat.Score);
        Assert.Contains(cat.Issues, i => i.Message.Contains("robots.txt", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void Build_missing_canonical_and_duplicate_title_meta()
    {
        var rows = new List<CrawlRow>
        {
            new()
            {
                Url = "https://example.com/a",
                Status = "200",
                Title = "Same",
                MetaDescription = "Same meta",
                CanonicalUrl = "",
            },
            new()
            {
                Url = "https://example.com/b",
                Status = "200",
                Title = "Same",
                MetaDescription = "Same meta",
                CanonicalUrl = "",
            },
        };

        var cat = TechnicalSeoCategoryBuilder.Build(rows, new Dictionary<string, object?>());
        Assert.Contains(cat.Issues, i => i.Message.Contains("Missing canonical", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(cat.Issues, i => i.Message.Contains("duplicate content", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void Build_many_console_errors_high_priority()
    {
        var pa = """{"browser":{"summary":{"console_error_count":1,"page_error_count":0}}}""";
        var rows = Enumerable.Range(0, 5)
            .Select(i => new CrawlRow
            {
                Url = $"https://example.com/{i}",
                Status = "200",
                PageAnalysisJson = pa,
            })
            .ToList();

        var cat = TechnicalSeoCategoryBuilder.Build(rows, new Dictionary<string, object?>());
        var consoleIssue = cat.Issues.Single(i => i.Message.Contains("console errors", StringComparison.OrdinalIgnoreCase));
        Assert.Equal("High", consoleIssue.Priority);
    }
}
