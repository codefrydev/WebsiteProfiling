using CoreService.Api.Application.Repositories;

namespace CoreService.Tests;

public sealed class CrawlRunResolverTests
{
    [Fact]
    public void NormalizeStartUrlKey_strips_trailing_slash_and_adds_scheme()
    {
        Assert.Equal("https://codefrydev.in", CrawlRunResolver.NormalizeStartUrlKey("codefrydev.in/"));
        Assert.Equal("https://example.com/path", CrawlRunResolver.NormalizeStartUrlKey("https://example.com/path/"));
    }
}
