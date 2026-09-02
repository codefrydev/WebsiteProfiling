using CoreService.Api.IntegrationsApplication.Google;

namespace CoreService.Tests;

public sealed class PageMetricsCompareTests
{
    [Fact]
    public void Build_computes_gsc_deltas()
    {
        var rows = PageMetricsCompare.Build(
            new PageMetricsPayload
            {
                Gsc = new PageGscMetrics { Clicks = 120, Impressions = 1000, Ctr = 5, Position = 8.2 },
            },
            new PageMetricsPayload
            {
                Gsc = new PageGscMetrics { Clicks = 100, Impressions = 800, Ctr = 4, Position = 9.5 },
            });

        var clicks = rows.First(r => r.Id == "gsc_clicks");
        Assert.Equal(20, clicks.Delta);
        Assert.Equal(20, clicks.DeltaPct);

        var pos = rows.First(r => r.Id == "gsc_pos");
        Assert.False(pos.HigherIsBetter);
        Assert.Equal(-1.3, pos.Delta);
    }

    [Fact]
    public void Build_omits_rows_when_both_sides_empty()
    {
        var rows = PageMetricsCompare.Build(new PageMetricsPayload(), new PageMetricsPayload());
        Assert.Empty(rows);
    }
}
