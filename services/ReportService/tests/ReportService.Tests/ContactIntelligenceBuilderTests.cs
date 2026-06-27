using ReportService.Application.Build;
using ReportService.Application.Repositories;

namespace ReportService.Tests;

public sealed class ContactIntelligenceBuilderTests
{
    [Fact]
    public async Task BuildAsync_dedupes_emails_and_uses_security_txt()
    {
        var pa = """
            {
              "json_ld_types": ["Organization"],
              "contact_signals": {
                "emails": ["Hello@Example.com", "other@example.com"],
                "phones": [],
                "addresses": [],
                "organization_names": ["Example Co"]
              }
            }
            """;

        var rows = new List<CrawlRow>
        {
            new()
            {
                Url = "https://example.com/contact",
                Status = "200",
                PageAnalysisJson = pa,
            },
        };

        var siteLevel = new Dictionary<string, object?>
        {
            ["security_txt_contact"] = new List<string> { "mailto:sec@example.com" },
        };

        var siteLevelBuilder = new SiteLevelBuilder(new StubHttpClientFactory());
        var outDict = await ContactIntelligenceBuilder.BuildAsync(
            rows,
            siteLevel,
            "https://example.com/",
            siteLevelBuilder,
            new Dictionary<string, string> { ["enable_rdap_org_lookup"] = "false" });

        var emails = Assert.IsType<List<Dictionary<string, object?>>>(outDict["emails"]);
        var values = emails.Select(e => e["value"]?.ToString()?.ToLowerInvariant()).ToHashSet();
        Assert.Contains("hello@example.com", values);
        Assert.Contains("other@example.com", values);
        Assert.Contains("sec@example.com", values);
        Assert.Equal("https://example.com/contact", outDict["primary_contact_page"]);
    }

    [Fact]
    public void SignalsFromPage_reads_json_ld_contact_signals()
    {
        var pa = ContactIntelligenceBuilder.ParsePageAnalysis("""
            {"contact_signals":{"emails":["a@x.com"],"phones":["+1"],"addresses":[],"organization_names":[]}}
            """);

        var signals = ContactIntelligenceBuilder.SignalsFromPage(pa);
        Assert.Equal(["a@x.com"], signals["emails"]);
        Assert.Equal(["+1"], signals["phones"]);
    }

    private sealed class StubHttpClientFactory : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new();
    }
}
