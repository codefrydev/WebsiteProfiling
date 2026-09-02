using System.Text.Json;
using CoreService.Api.DataApplication.Dto.Portfolio;
using CoreService.Api.DataApplication.Portfolio;

namespace CoreService.Tests;

public class PortfolioGroupingTests
{
    [Fact]
    public void Compute_domain_groups_builds_expected_shape()
    {
        const string payloadJson = """
            {
              "site_name": "Example",
              "summary": { "count_2xx": 8, "count_3xx": 0, "count_4xx": 1, "count_5xx": 0, "count_error": 0, "total_urls": 9 },
              "categories": [
                { "id": "technical_seo", "name": "Technical SEO", "score": 80, "issues": [{ "priority": "High" }] }
              ],
              "top_pages": [{ "url": "https://example.com/" }],
              "crawl_run_id": 5
            }
            """;

        using var doc = JsonDocument.Parse(payloadJson);
        var payload = doc.RootElement.Clone();

        var maps = new PortfolioMaps
        {
            StartUrlByRunId = new Dictionary<long, string> { [5] = "https://example.com/" },
            RunCreatedAtByRunId = new Dictionary<long, string> { [5] = "2024-01-01T00:00:00+00:00" },
            RunMetaByRunId = new Dictionary<long, PortfolioMaps.CrawlRunMeta>(),
            CrawlSummaries = [],
        };

        var reports = new List<PortfolioReportRow>
        {
            new() { Id = 1, GeneratedAt = "2024-01-02T00:00:00+00:00" },
        };

        var groups = PortfolioGrouping.ComputeDomainGroups(reports, maps, _ => payload);

        Assert.Single(groups);
        var group = groups[0];
        Assert.Equal("example.com", group.DomainName);
        Assert.Equal(80, group.HealthScore);
        Assert.Equal(1, group.ReportId);
        Assert.Equal(5, group.CrawlRunId);
        Assert.Equal(1, group.IssueCounts.High);
        Assert.Equal("example.com", group.DomainParam);
    }

    [Fact]
    public void Compute_summary_averages_health_scores()
    {
        var groups = new List<PortfolioGroupDto>
        {
            new() { HealthScore = 80, UrlCount = 10 },
            new() { HealthScore = 60, UrlCount = 5 },
        };

        var summary = PortfolioGrouping.ComputeSummary(groups);
        Assert.Equal(2, summary.TotalBrands);
        Assert.Equal(15, summary.TotalUrls);
        Assert.Equal(70, summary.AvgHealth);
    }
}
