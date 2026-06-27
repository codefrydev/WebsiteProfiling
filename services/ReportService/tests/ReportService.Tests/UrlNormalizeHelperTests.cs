using ReportService.Application.Build;

namespace ReportService.Tests;

public sealed class UrlNormalizeHelperTests
{
    [Fact]
    public void ToNormalizedUrlMap_last_url_wins_when_normalized_keys_collide()
    {
        var map = UrlNormalizeHelper.ToNormalizedUrlMap([
            "https://codefrydev.in/JsonPlayground/xaml",
            "http://www.codefrydev.in/JsonPlayground/xaml/",
        ]);

        Assert.Single(map);
        Assert.Equal(
            "http://www.codefrydev.in/JsonPlayground/xaml/",
            map["codefrydev.in/JsonPlayground/xaml"]);
    }
}
