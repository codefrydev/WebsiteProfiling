using System.Text.Json;
using CoreService.Api.Rendering.Exports;

namespace CoreService.Tests;

public class ReportExportersTests
{
    private const string SampleJson = """
    {
      "site_name": "Example",
      "report_generated_at": "2026-01-01",
      "report_meta": { "data_sources": ["Crawl", "Lighthouse"] },
      "links": [
        { "url": "https://example.com/", "status": 200, "title": "Home", "inlinks": 3, "word_count": 100 },
        { "url": "https://example.com/secret", "status": 200, "noindex": true },
        { "url": "https://example.com/missing", "status": 404 }
      ],
      "executive_summary": {
        "summary": "Looks good",
        "source": "ai_insights",
        "priorities": ["Fix titles", "Add alt text"]
      },
      "categories": [
        {
          "name": "Link Health",
          "issues": [
            {
              "priority": "High",
              "message": "Broken link",
              "url": "https://example.com/x",
              "recommendation": "Fix it",
              "llm_recommendation": "Fix it now"
            }
          ]
        }
      ]
    }
    """;

    private static JsonElement Sample()
    {
        using var doc = JsonDocument.Parse(SampleJson);
        return doc.RootElement.Clone();
    }

    [Fact]
    public void Csv_renders_all_sections()
    {
        var csv = new ReportCsvExporter().Generate(Sample());

        Assert.Contains("# Site Audit export", csv);
        Assert.Contains("site_name,Example", csv);
        Assert.Contains("Crawl, Lighthouse", csv);            // data_sources joined (quoted)
        Assert.Contains("https://example.com/,200,Home,3,100", csv); // links row
        Assert.Contains("# Executive summary", csv);
        Assert.Contains("source,AI insights", csv);           // ai_insights -> label
        Assert.Contains("summary,Looks good", csv);
        Assert.Contains("priority_1,Fix titles", csv);
        Assert.Contains("priority_2,Add alt text", csv);
        // Legacy category name remapped (Link Health -> Links); distinct llm recommendation used.
        Assert.Contains("Links,High,Broken link,https://example.com/x,Fix it now,Fix it now", csv);
        Assert.Contains("\r\n", csv); // CRLF line endings (csv.writer parity)
    }

    [Fact]
    public void Sitemap_includes_only_indexable_2xx_urls()
    {
        var xml = new ReportSitemapExporter().Generate(Sample());

        Assert.Contains("<urlset", xml);
        Assert.Contains("<loc>https://example.com/</loc>", xml);
        Assert.DoesNotContain("secret", xml);   // noindex excluded
        Assert.DoesNotContain("missing", xml);   // non-2xx excluded
    }

    [Fact]
    public void Json_roundtrips_payload()
    {
        var json = new ReportJsonExporter().Generate(Sample());
        using var doc = JsonDocument.Parse(json);
        Assert.Equal("Example", doc.RootElement.GetProperty("site_name").GetString());
    }
}
