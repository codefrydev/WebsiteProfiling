using CoreService.Api.Application.Build;
using CoreService.Api.Application.Repositories;

namespace CoreService.Tests;

public sealed class ContentUrlListsBuilderTests
{
    [Fact]
    public void Build_classifies_on_page_content_issues()
    {
        var rows = new List<CrawlRow>
        {
            new()
            {
                Url = "https://a.com/1",
                Status = "200",
                H1Count = 0,
                Title = "",
                MetaDescriptionLen = 0,
                ContentLength = 50,
                CanonicalUrl = "",
                ImagesWithoutAlt = 2,
                ImagesTotal = 3,
                ImgWithoutLazy = 1,
                ImgWithoutDimensions = 1,
                ResponseTimeMs = 3000,
                HtmlLang = "",
                ViewportPresent = false,
                ReadingLevel = 15,
                WordCount = 50,
            },
            new()
            {
                Url = "https://a.com/2",
                Status = "200",
                H1Count = 2,
                Title = new string('T', 70),
                MetaDescriptionLen = 300,
                ContentLength = 5000,
                CanonicalUrl = "https://a.com/other",
                ImagesWithoutAlt = 0,
                ImagesTotal = 1,
                ResponseTimeMs = 100,
                HtmlLang = "en",
                ViewportPresent = true,
                ReadingLevel = 5,
                WordCount = 500,
            },
        };

        var outLists = ContentUrlListsBuilder.Build(rows, rows);
        var u1 = "https://a.com/1";

        Assert.Contains(outLists["missing_h1"], r => r["url"]?.ToString() == u1);
        Assert.Contains(outLists["missing_title"], r => r["url"]?.ToString() == u1);
        Assert.Contains(outLists["missing_meta_desc"], r => r["url"]?.ToString() == u1);
        Assert.Contains(outLists["thin_content"], r => r["url"]?.ToString() == u1);
        Assert.Contains(outLists["missing_canonical"], r => r["url"]?.ToString() == u1);
        Assert.Contains(outLists["missing_alt"], r => r["url"]?.ToString() == u1);
        Assert.Contains(outLists["missing_lazy"], r => r["url"]?.ToString() == u1);
        Assert.Contains(outLists["missing_dimensions"], r => r["url"]?.ToString() == u1);
        Assert.Contains(outLists["slow_response"], r => r["url"]?.ToString() == u1);
        Assert.Contains(outLists["missing_html_lang"], r => r["url"]?.ToString() == u1);
        Assert.Contains(outLists["invalid_viewport"], r => r["url"]?.ToString() == u1);
        Assert.Contains(outLists["high_reading_level"], r => r["url"]?.ToString() == u1);
        Assert.Contains(outLists["very_thin_content"], r => r["url"]?.ToString() == u1);

        var u2 = "https://a.com/2";
        Assert.Contains(outLists["multiple_h1"], r => r["url"]?.ToString() == u2);
        Assert.Contains(outLists["meta_desc_long"], r => r["url"]?.ToString() == u2);
        Assert.Contains(outLists["title_long"], r => r["url"]?.ToString() == u2);
        Assert.Contains(outLists["canonical_mismatch"], r => r["url"]?.ToString() == u2);
    }
}
