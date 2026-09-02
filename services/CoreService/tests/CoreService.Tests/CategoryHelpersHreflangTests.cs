using CoreService.Api.Application.Build;
using CoreService.Api.Application.Repositories;

namespace CoreService.Tests;

public sealed class CategoryHelpersHreflangTests
{
    [Fact]
    public void HreflangIssues_reports_multiple_self_reference_gaps()
    {
        var rows = Enumerable.Range(0, 3)
            .Select(i => new CrawlRow
            {
                Url = $"https://example.com/{i}",
                Status = "200",
                PageAnalysisJson = $$"""
                    {"hreflang_alternates":[{"hreflang":"en","href":"https://example.com/other"}]}
                    """,
            })
            .ToList();

        var issues = CategoryHelpers.HreflangIssues(rows);

        Assert.Equal(3, issues.Count(i =>
            i.Message.StartsWith("Hreflang cluster missing", StringComparison.Ordinal)));
    }
}
