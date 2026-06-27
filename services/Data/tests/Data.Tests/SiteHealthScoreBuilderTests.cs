using System.Text.Json;
using WebsiteProfiling.Contracts.Report;

namespace Data.Tests;

public sealed class SiteHealthScoreBuilderTests
{
    [Fact]
    public void ResolveFromPayload_prefers_summary_site_health_score()
    {
        const string json = """
            {
              "summary": { "site_health_score": 72 },
              "site_health_score": 65,
              "categories": [{ "id": "technical_seo", "score": 10 }]
            }
            """;

        using var doc = JsonDocument.Parse(json);
        Assert.Equal(72, SiteHealthScoreBuilder.ResolveFromPayload(doc.RootElement));
    }

    [Fact]
    public void ComputeFromJsonCategories_uses_weighted_fixable_categories()
    {
        const string json = """
            {
              "categories": [
                { "id": "technical_seo", "score": 80 },
                { "id": "link_health", "score": 60 },
                { "id": "performance", "score": 70 },
                { "id": "security", "score": 90 },
                { "id": "core_web_vitals", "score": 50 },
                { "id": "mobile", "score": 40 },
                { "id": "html_accessibility", "score": 100 },
                { "id": "search_performance", "score": 10 },
                { "id": "intelligence", "score": 0 }
              ]
            }
            """;

        using var doc = JsonDocument.Parse(json);
        var categories = doc.RootElement.GetProperty("categories");
        Assert.Equal(70, SiteHealthScoreBuilder.ComputeFromJsonCategories(categories));
    }
}
