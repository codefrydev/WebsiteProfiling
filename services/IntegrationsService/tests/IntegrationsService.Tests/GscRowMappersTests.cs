using IntegrationsService.Application.Google;

namespace IntegrationsService.Tests;

/// <summary>
/// Golden parity with Python gsc._to_query_record / _to_page_record (ctr stored as percent).
/// </summary>
public sealed class GscRowMappersTests
{
    [Fact]
    public void ToQueryRecord_matches_python_golden_values()
    {
        var row = GscRowMappers.ToQueryRecord("seo audit", 42, 1000, 0.042, 8.37);

        Assert.Equal("seo audit", row.Query);
        Assert.Equal(42, row.Clicks);
        Assert.Equal(1000, row.Impressions);
        Assert.Equal(4.2, row.Ctr);
        Assert.Equal(8.4, row.Position);
    }

    [Fact]
    public void ToPageRecord_matches_python_golden_values()
    {
        var row = GscRowMappers.ToPageRecord("https://example.com/blog/", 10, 500, 0.02, 8.37);

        Assert.Equal("https://example.com/blog/", row.Page);
        Assert.Equal(10, row.Clicks);
        Assert.Equal(500, row.Impressions);
        Assert.Equal(2.0, row.Ctr);
        Assert.Equal(8.4, row.Position);
    }
}
