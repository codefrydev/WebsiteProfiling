using CoreService.Api.Application.Build.Categories;
using CoreService.Api.Application.Repositories;

namespace CoreService.Tests;

public sealed class CategoryBuilderSlice2Tests
{
    [Fact]
    public void HtmlAccessibility_h1_headings_and_contrast_fallback()
    {
        var rows = new List<CrawlRow>
        {
            new()
            {
                Url = "https://example.com/zero",
                Status = "200",
                H1Count = 0,
                HeadingSequence = "h1,h3",
            },
            new()
            {
                Url = "https://example.com/multi",
                Status = "200",
                H1Count = 2,
            },
            new()
            {
                Url = "https://example.com/commas",
                Status = "200",
                H1Count = 1,
                HeadingSequence = ",,,",
            },
        };

        var cat = HtmlAccessibilityCategoryBuilder.Build(rows);
        var msgs = string.Join(" ", cat.Issues.Select(i => i.Message)).ToLowerInvariant();

        Assert.Contains("missing h1", msgs);
        Assert.Contains("multiple h1", msgs);
        Assert.Contains("skipped heading", msgs);
        Assert.Contains("color contrast is not measured", msgs);
    }

    [Fact]
    public void HtmlAccessibility_alt_thin_reading_level()
    {
        var rows = new List<CrawlRow>
        {
            new()
            {
                Url = "https://example.com/thin",
                Status = "200",
                H1Count = 1,
                ImagesTotal = 3,
                ImagesWithoutAlt = 2,
                WordCount = 50,
                ReadingLevel = 16,
            },
        };

        var cat = HtmlAccessibilityCategoryBuilder.Build(rows);
        var msgs = string.Join(" ", cat.Issues.Select(i => i.Message)).ToLowerInvariant();

        Assert.Contains("without alt", msgs);
        Assert.Contains("thin content", msgs);
        Assert.Contains("reading level", msgs);
    }

    [Fact]
    public void LinkHealth_broken_redirects_chains_orphans()
    {
        var rows = new List<CrawlRow>
        {
            new() { Url = "https://example.com/", Status = "200", RedirectChainLength = 3 },
            new() { Url = "https://example.com/o1", Status = "200" },
            new() { Url = "https://example.com/o2", Status = "200" },
            new() { Url = "https://example.com/o3", Status = "200" },
            new() { Url = "https://example.com/hub", Status = "200" },
        };
        var edges = new List<(string From, string To)>
        {
            ("https://example.com/hub", "https://example.com/child"),
        };
        var broken = new List<Dictionary<string, string>>
        {
            new() { ["url"] = "https://example.com/500", ["status"] = "500" },
        };
        var redirects = new List<Dictionary<string, string>>
        {
            new()
            {
                ["url"] = "https://example.com/old",
                ["status"] = "301",
                ["final_url"] = "https://example.com/new",
            },
        };

        var cat = LinkHealthCategoryBuilder.Build(rows, edges, broken, redirects);
        var msgs = string.Join(" ", cat.Issues.Select(i => i.Message)).ToLowerInvariant();

        Assert.Contains("broken url: 500", msgs);
        Assert.Contains("redirect:", msgs);
        Assert.Contains("redirect chains", msgs);
        Assert.Contains("no internal links", msgs);
        Assert.Contains("orphan", msgs);
    }

    [Fact]
    public void TechnicalSeo_schema_invalid_json_ld()
    {
        var rows = new List<CrawlRow>
        {
            new()
            {
                Url = "https://example.com/schema",
                Status = "200",
                HasSchema = true,
                PageAnalysisJson = "{}",
            },
        };

        var cat = TechnicalSeoCategoryBuilder.Build(rows, new Dictionary<string, object?>());
        var msgs = string.Join(" ", cat.Issues.Select(i => i.Message)).ToLowerInvariant();
        Assert.Contains("structured data present but could not parse", msgs);
    }
}
