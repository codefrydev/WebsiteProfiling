using ReportService.Application.Build;
using ReportService.Application.Repositories;

namespace ReportService.Tests;

public sealed class SeoSummaryBuilderTests
{
    [Fact]
    public void Compute_excludes_4xx_from_seo_health_counts()
    {
        var rows = new List<CrawlRow>
        {
            new()
            {
                Url = "https://example.com/ok",
                Status = "200",
                Title = "Good title with enough length here",
                MetaDescriptionLen = 100,
                H1Count = 1,
                WordCount = 500,
            },
            new()
            {
                Url = "https://example.com/missing",
                Status = "404",
                Title = "",
                H1Count = 0,
                ContentLength = 50,
            },
        };

        var result = SeoSummaryBuilder.Compute(rows);

        Assert.Equal(0, result.SeoHealth["missing_title"]);
        Assert.Equal(0, result.SeoHealth["h1_zero"]);
        Assert.Equal(0, result.SeoHealth["thin_content"]);
        Assert.Empty(result.Issues["seo"]);
    }

    [Fact]
    public void Compute_flags_thin_content_by_word_count()
    {
        var rows = new List<CrawlRow>
        {
            new()
            {
                Url = "https://example.com/thin",
                Status = "200",
                Title = "Title with enough characters for SEO checks",
                MetaDescriptionLen = 100,
                H1Count = 1,
                WordCount = 150,
            },
        };

        var result = SeoSummaryBuilder.Compute(rows);

        Assert.Equal(1, result.SeoHealth["thin_content"]);
    }

    [Fact]
    public void Compute_crawl_time_is_duration_not_first_timestamp()
    {
        var rows = new List<CrawlRow>
        {
            new() { Url = "https://example.com/a", Status = "200", CrawlTimeS = 0 },
            new() { Url = "https://example.com/b", Status = "200", CrawlTimeS = 42.5 },
        };

        var result = SeoSummaryBuilder.Compute(rows);

        Assert.Equal(42.5, result.Summary["crawl_time_s"]);
    }
}
