using ReportService.Application.Build;
using ReportService.Application.Repositories;

namespace ReportService.Tests;

public sealed class SecurityScanBuilderTests
{
    [Fact]
    public void BuildPassive_flags_missing_hsts_once()
    {
        var rows = new List<CrawlRow>
        {
            new() { Url = "https://example.com/a", Status = "200" },
            new() { Url = "https://example.com/b", Status = "200" },
        };

        var findings = SecurityScanBuilder.BuildPassive(rows, "https://example.com/");

        Assert.Contains(findings, f => f["finding_type"]?.ToString() == "missing_hsts");
        Assert.Equal(1, findings.Count(f => f["finding_type"]?.ToString() == "missing_hsts"));
    }
}

public sealed class CompetitorLinkGapBuilderTests
{
    [Fact]
    public void Build_marks_competitors_not_in_our_sample()
    {
        var gscLinks = new Dictionary<string, object?>
        {
            ["top_linking_sites"] = new List<object?>
            {
                new Dictionary<string, object?> { ["site"] = "partner.com" },
            },
        };

        var gap = CompetitorLinkGapBuilder.Build(gscLinks, ["rival.com", "partner.com"]);

        Assert.NotNull(gap);
        var competitors = Assert.IsAssignableFrom<IEnumerable<object?>>(gap!["competitors"]).ToList();
        Assert.Equal(2, competitors.Count);
    }
}

public sealed class UrlJoinBuilderTests
{
    [Fact]
    public void Build_counts_crawl_only_urls()
    {
        var join = UrlJoinBuilder.Build(
            ["https://example.com/a", "https://example.com/b"],
            ["https://example.com/a"],
            [],
            "https://example.com/");

        Assert.Equal(1, join["matched"]);
        Assert.Equal(1, join["crawl_only"]);
    }
}
