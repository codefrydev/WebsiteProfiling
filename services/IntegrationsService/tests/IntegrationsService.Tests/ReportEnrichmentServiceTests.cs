using IntegrationsService.Application.Report;

namespace IntegrationsService.Tests;

public sealed class ReportEnrichmentServiceTests
{
    [Fact]
    public void CapGscLinksForReport_truncates_oversized_lists()
    {
        var sample = Enumerable.Range(0, 2500).Select(i => (object?)new Dictionary<string, object?> { ["url"] = $"s{i}" }).ToList();
        var latest = Enumerable.Range(0, 1000).Select(i => (object?)new Dictionary<string, object?> { ["url"] = $"l{i}" }).ToList();
        var data = new Dictionary<string, object?>
        {
            ["sample_links"] = sample,
            ["latest_links"] = latest,
            ["imported_at"] = "2026-06-01T00:00:00Z",
        };

        var capped = ReportEnrichmentService.CapGscLinksForReport(data);

        Assert.Equal(2500, capped["sample_links_full_count"]);
        Assert.Equal(1000, capped["latest_links_full_count"]);
        Assert.Equal(2000, Assert.IsType<List<object?>>(capped["sample_links"]).Count);
        Assert.Empty(Assert.IsType<List<object?>>(capped["latest_links"]));
    }
}
