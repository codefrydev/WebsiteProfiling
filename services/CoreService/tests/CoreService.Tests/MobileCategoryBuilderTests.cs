using CoreService.Api.Application.Build.Categories;
using CoreService.Api.Application.Repositories;

namespace CoreService.Tests;

public sealed class MobileCategoryBuilderTests
{
    [Fact]
    public void Build_empty_success_returns_zero_score()
    {
        var rows = new List<CrawlRow>
        {
            new() { Url = "https://example.com/", Status = "404" },
        };

        var cat = MobileCategoryBuilder.Build(rows);
        Assert.Equal(0, cat.Score);
    }

    [Fact]
    public void Build_viewport_missing_and_invalid()
    {
        var rows = new List<CrawlRow>
        {
            new()
            {
                Url = "https://example.com/no-vp",
                Status = "200",
                ViewportPresent = false,
                ViewportContent = "",
            },
            new()
            {
                Url = "https://example.com/bad-vp",
                Status = "200",
                ViewportPresent = true,
                ViewportContent = "initial-scale=1",
            },
        };

        var cat = MobileCategoryBuilder.Build(rows);
        var msgs = string.Join(" ", cat.Issues.Select(i => i.Message)).ToLowerInvariant();
        Assert.Contains("missing viewport", msgs);
        Assert.Contains("without width or device-width", msgs);
    }
}
