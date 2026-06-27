using System.Text.Json;
using ReportService.Application.Build;
using ReportService.Application.Repositories;

namespace ReportService.Tests;

public sealed class IndexationCoverageIssuesTests
{
    [Fact]
    public void IndexationCoverageIssues_flags_noindex_urls_in_sitemap()
    {
        var rows = new List<CrawlRow>
        {
            new() { Url = "https://example.com/private", Status = "200", Noindex = true },
            new() { Url = "https://example.com/public", Status = "200", Noindex = false },
        };
        var indexation = JsonSerializer.Deserialize<Dictionary<string, object?>>(
            """
            {
              "sitemap_urls": ["https://example.com/private", "https://example.com/public"]
            }
            """)!;

        var issues = CategoryHelpers.IndexationCoverageIssues(rows, indexation);

        Assert.Single(issues);
        Assert.Contains("noindex", issues[0].Message, StringComparison.OrdinalIgnoreCase);
        Assert.Equal("Critical", issues[0].Priority);
    }
}
