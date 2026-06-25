using System.Text.Json;
using IntegrationsService.Application.Repositories;

namespace IntegrationsService.Tests;

public sealed class PageLookupGoldenTests
{
    private const string GoldenBlob = """
        {
          "fetched_at": "2026-06-20T10:00:00Z",
          "date_range": { "start": "2026-05-23", "end": "2026-06-19" },
          "gsc_full": {
            "summary": { "clicks": 100, "impressions": 5000 },
            "by_page": {
              "https://example.com/page-a": {
                "page": "https://example.com/page-a",
                "clicks": 12,
                "impressions": 300,
                "ctr": 4.0,
                "position": 5.2,
                "queries": [{ "query": "test query", "clicks": 5, "impressions": 100, "ctr": 5.0, "position": 4.0 }]
              }
            }
          },
          "ga4_full": {
            "summary": { "sessions": 200 },
            "by_path": {
              "/page-a": {
                "path": "/page-a",
                "full_url": "https://example.com/page-a",
                "sessions": 50,
                "users": 40,
                "pageviews": 60
              }
            }
          },
          "url_join": { "matched": 1, "lists": { "crawl_only": [], "gsc_only": [], "ga4_only": [] } }
        }
        """;

    [Fact]
    public void SliceFromGoogleRow_matches_golden_page_metrics()
    {
        using var doc = JsonDocument.Parse(GoldenBlob);
        var slice = PageLookupService.SliceFromGoogleRow(doc.RootElement, "https://example.com/page-a");

        Assert.Equal("snapshot", slice.Source);
        var gsc = Assert.IsType<Dictionary<string, object?>>(slice.Gsc);
        Assert.Equal(12, Convert.ToInt32(gsc["clicks"]));
        Assert.Equal(300, Convert.ToInt32(gsc["impressions"]));
        var ga4 = Assert.IsType<Dictionary<string, object?>>(slice.Ga4);
        Assert.Equal(50, Convert.ToInt32(ga4["sessions"]));
        Assert.True(slice.Coverage.InGsc);
        Assert.True(slice.Coverage.InGa4);
    }
}
