using ReportService.Application.Build;
using ReportService.Application.Repositories;

namespace ReportService.Tests;

public sealed class OptionalAuditsBuilderTests
{
    [Fact]
    public void PaginationIssues_detects_orphan_prev_and_amp_mismatch()
    {
        var rows = new List<CrawlRow>
        {
            new()
            {
                Url = "https://example.com/page/2",
                PageAnalysisJson = """{"pagination":{"rel_prev":"https://example.com/page/1"}}""",
            },
            new()
            {
                Url = "https://example.com/amp/page",
                CanonicalUrl = "https://example.com/page",
                PageAnalysisJson = """{"pagination":{"amphtml":"https://example.com/other"}}""",
            },
        };

        var issues = OptionalAuditsBuilder.PaginationIssues(rows);

        Assert.Equal(2, issues.Count);
        Assert.Contains(issues, i => i.Message.Contains("rel=prev", StringComparison.Ordinal));
        Assert.Contains(issues, i => i.Message.Contains("amphtml", StringComparison.Ordinal));
    }

    [Fact]
    public void SpellCheckIssues_skips_when_dictionary_missing()
    {
        var rows = new List<CrawlRow>
        {
            new()
            {
                Url = "https://example.com/",
                Status = "200",
                Title = "This is a long enough title with zzqxzz zzqxzz zzqxzz for testing",
                H1 = "Heading",
                ContentExcerpt = "More content here for spell checking purposes.",
            },
        };

        var (_, skipReason) = OptionalAuditsBuilder.SpellCheckIssues(rows);

        Assert.NotNull(skipReason);
    }

    [Fact]
    public void AmpAuditIssues_flags_missing_canonical()
    {
        var rows = new List<CrawlRow>
        {
            new()
            {
                Url = "https://example.com/news/amp/",
                ContentType = "text/html; amp",
                PageAnalysisJson = """{"pagination":{"amphtml":"https://example.com/news/amp/"}}""",
            },
        };

        var issues = OptionalAuditsBuilder.AmpAuditIssues(rows);

        Assert.Single(issues);
        Assert.Contains("missing canonical", issues[0].Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void AxeIssuesFromRows_parses_violations()
    {
        var rows = new List<CrawlRow>
        {
            new()
            {
                Url = "https://example.com/",
                PageAnalysisJson = """
                    {
                      "axe_violations": [
                        {"id":"color-contrast","description":"Contrast too low","help":"Fix contrast"}
                      ]
                    }
                    """,
            },
        };

        var issues = OptionalAuditsBuilder.AxeIssuesFromRows(rows);

        Assert.Single(issues);
        Assert.StartsWith("axe:", issues[0].Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task ApplyAsync_merges_pagination_into_technical_seo()
    {
        var categories = new List<ReportCategory>
        {
            new("technical_seo", "Technical SEO", 90, [], []),
            new("intelligence", "Content quality", 100, [], []),
        };
        var rows = new List<CrawlRow>
        {
            new()
            {
                Url = "https://example.com/p/2",
                PageAnalysisJson = """{"pagination":{"rel_prev":"https://example.com/p/1"}}""",
            },
        };

        var (updated, meta) = await OptionalAuditsBuilder.ApplyAsync(
            categories,
            rows,
            new Dictionary<string, string>(),
            crawlRunId: null,
            htmlReader: null,
            httpClientFactory: null);

        var tech = updated.First(c => c.Id == "technical_seo");
        Assert.NotEmpty(tech.Issues);
        Assert.Equal(1, meta.GetValueOrDefault("pagination_issues"));
    }
}
