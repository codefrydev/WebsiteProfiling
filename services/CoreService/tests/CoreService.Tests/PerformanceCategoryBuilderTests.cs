using CoreService.Api.Application.Build.Categories;
using CoreService.Api.Application.Repositories;

namespace CoreService.Tests;

public sealed class PerformanceCategoryBuilderTests
{
    [Fact]
    public void Build_empty_success_returns_zero_score()
    {
        var rows = new List<CrawlRow>
        {
            new() { Url = "https://example.com/", Status = "404" },
        };

        var cat = PerformanceCategoryBuilder.Build(rows);
        Assert.Equal(0, cat.Score);
        Assert.Empty(cat.Issues);
    }

    [Fact]
    public void Build_slow_response_and_p95()
    {
        var rows = Enumerable.Range(0, 8)
            .Select(i => new CrawlRow
            {
                Url = $"https://example.com/{i}",
                Status = "200",
                ResponseTimeMs = 3500,
            })
            .ToList();

        var cat = PerformanceCategoryBuilder.Build(rows);
        var msgs = string.Join(" ", cat.Issues.Select(i => i.Message)).ToLowerInvariant();
        Assert.Contains("server response time", msgs);
        Assert.Contains("95th percentile", msgs);
    }

    [Fact]
    public void Build_lazy_load_img_cache_scripts()
    {
        var rows = Enumerable.Range(0, 2)
            .Select(i => new CrawlRow
            {
                Url = $"https://example.com/{i}",
                Status = "200",
                ResponseTimeMs = 100,
                ImagesTotal = 4,
                ImgWithoutLazy = 3,
                ImgWithoutDimensions = 2,
                CacheControl = "",
                ScriptCount = 15,
            })
            .ToList();

        var cat = PerformanceCategoryBuilder.Build(rows);
        var msgs = string.Join(" ", cat.Issues.Select(i => i.Message)).ToLowerInvariant();
        Assert.Contains("lazy loading", msgs);
        Assert.Contains("without width/height", msgs);
        Assert.Contains("cache-control", msgs);
        Assert.Contains("script tags", msgs);
    }
}
