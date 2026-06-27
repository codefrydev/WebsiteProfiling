using ReportService.Application.Build;
using ReportService.Application.Repositories;

namespace ReportService.Tests;

public sealed class ReportChartDataBuilderTests
{
    [Fact]
    public void Build_bins_outlinks_and_status_counts()
    {
        var rows = new List<CrawlRow>
        {
            new() { Url = "https://example.com/a", Status = "200", Outlinks = 0, Title = "Short", ContentType = "text/html" },
            new() { Url = "https://example.com/b", Status = "404", Outlinks = 5, Title = new string('x', 30), ContentType = "text/html; charset=utf-8" },
            new() { Url = "https://example.com/c", Status = "200", Outlinks = 12, Title = new string('y', 120), ContentType = "application/json" },
        };

        var chart = ReportChartDataBuilder.Build(rows);

        Assert.Equal(2, chart.StatusCounts["200"]);
        Assert.Equal(1, chart.StatusCounts["404"]);
        Assert.Contains("text/html", chart.MimeLabels);
        Assert.Equal(8, chart.OutlinkCounts.Count);
        Assert.Equal(6, chart.TitleCounts.Count);
        Assert.Single(chart.DomainLabels);
        Assert.Equal("example.com", chart.DomainLabels[0]);
    }
}
