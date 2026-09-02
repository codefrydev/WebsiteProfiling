using CoreService.Api.Application.Build;
using CoreService.Api.Application.Repositories;

namespace CoreService.Tests;

public sealed class ReportMetadataBuilderTests
{
    [Fact]
    public void BuildOutboundLinkDomains_reads_external_links_after_page_analysis_parse()
    {
        var rows = new List<CrawlRow>
        {
            new()
            {
                Url = "https://codefrydev.in/",
                Status = "200",
                PageAnalysisJson = """
                    {
                      "external_links": [
                        "https://github.com/codefrydev",
                        "https://github.com/codefrydev",
                        "https://fonts.googleapis.com/css2"
                      ]
                    }
                    """,
            },
        };

        var domains = ReportMetadataBuilder.BuildOutboundLinkDomains(rows, "https://codefrydev.in", 20);

        Assert.Contains(domains, row =>
            string.Equals(row["host"]?.ToString(), "github.com", StringComparison.OrdinalIgnoreCase)
            && (int)(row["link_count"] ?? 0) == 2);
        Assert.Contains(domains, row =>
            string.Equals(row["host"]?.ToString(), "fonts.googleapis.com", StringComparison.OrdinalIgnoreCase)
            && (int)(row["link_count"] ?? 0) == 1);
    }
}
