using System.Text.Json;
using ReportService.Application.Build;
using ReportService.Application.Repositories;

namespace ReportService.Tests;

/// <summary>
/// Score and issue-count expectations derived from Python category builders on
/// <c>tests/fixtures/report/minimal_crawl.json</c>.
/// </summary>
public sealed class CategoryBuilderParityTests
{
    private static (List<CrawlRow> Rows, Dictionary<string, object?> SiteLevel, Dictionary<string, object?> SummarySeo) LoadFixture()
    {
        var root = CategoryBuilderGoldenTests.FindRepoRootForTests();
        var json = File.ReadAllText(Path.Combine(root, "tests/fixtures/report/minimal_crawl.json"));
        using var doc = JsonDocument.Parse(json);
        var rows = doc.RootElement.EnumerateArray()
            .Select(el =>
            {
                var url = el.GetProperty("url").GetString()!.Trim();
                return CrawlRowMapper.MergeRow(url, "static", el.GetRawText());
            })
            .ToList();

        var siteLevel = JsonSerializer.Deserialize<Dictionary<string, object?>>(
            """{"robots_present": true, "sitemap_present": true, "sitemap_valid": true}""")!;
        var summarySeo = JsonSerializer.Deserialize<Dictionary<string, object?>>(
            """
            {
              "issues": {
                "broken": [{"url": "https://example.com/broken", "status": "404"}],
                "redirects": [{"url": "https://example.com/redirect", "status": "301", "final_url": "https://example.com/"}]
              }
            }
            """)!;
        return (rows, siteLevel, summarySeo);
    }

    [Fact]
    public void BuildCategories_scores_match_python_fixture()
    {
        var (rows, siteLevel, summarySeo) = LoadFixture();
        var builder = new CategoryBuilder();
        var categories = builder.BuildCategories(
            rows,
            [],
            summarySeo,
            siteLevel,
            "https://example.com/");

        var byId = categories.ToDictionary(c => c.Id, StringComparer.Ordinal);
        // Python: noindex (-3) + missing html lang on 4/4 pages (-2) on minimal fixture
        Assert.Equal(95, byId["technical_seo"].Score);
        Assert.Equal(100, byId["performance"].Score);
        Assert.Equal(100, byId["mobile"].Score);
        // Python: two thin pages under 100 words (-6) on minimal fixture
        Assert.Equal(94, byId["html_accessibility"].Score);
        // Python: one broken (-2) + one redirect (-1)
        Assert.Equal(97, byId["link_health"].Score);
        // Security header deductions come from passive findings only (not inline header checks).
        Assert.Equal(100, byId["security"].Score);
        Assert.Equal(100, byId["intelligence"].Score);
    }

    [Fact]
    public void BuildCategories_issue_counts_match_python_fixture()
    {
        var (rows, siteLevel, summarySeo) = LoadFixture();
        var builder = new CategoryBuilder();
        var categories = builder.BuildCategories(
            rows,
            [],
            summarySeo,
            siteLevel,
            "https://example.com/");

        var byId = categories.ToDictionary(c => c.Id, StringComparer.Ordinal);
        Assert.Equal(4, byId["technical_seo"].Issues.Count);
        Assert.Empty(byId["performance"].Issues);
        Assert.Empty(byId["mobile"].Issues);
        Assert.Equal(2, byId["html_accessibility"].Issues.Count);
        Assert.Equal(2, byId["link_health"].Issues.Count);
    }

    [Fact]
    public void SeoSummary_success_rate_matches_python_numeric_status()
    {
        var rows = new List<CrawlRow>
        {
            CrawlRowMapper.MergeRow("https://example.com/a", "static", """{"status":200}"""),
            CrawlRowMapper.MergeRow("https://example.com/b", "static", """{"status":301}"""),
            CrawlRowMapper.MergeRow("https://example.com/c", "static", """{"status":404}"""),
        };

        var result = SeoSummaryBuilder.Compute(rows);
        Assert.Equal(3, result.Summary["total_urls"]);
        Assert.Equal(1, result.Summary["count_2xx"]);
        Assert.Equal(1, result.Summary["count_3xx"]);
        Assert.Equal(1, result.Summary["count_4xx"]);
        Assert.Equal(33.3, result.Summary["success_rate"]);
    }
}
