using System.Text.Json;
using CoreService.Api.Application.Build;
using CoreService.Api.Application.Repositories;

namespace CoreService.Tests;

public sealed class LinksListBuilderTests
{
    [Fact]
    public void BuildLinksList_maps_fields_and_ml_overlays()
    {
        var rows = new List<CrawlRow>
        {
            new()
            {
                Url = "https://a.com/p",
                Status = "200",
                Title = "Hi",
                ContentLength = 1234,
                WordCount = 300,
                ResponseTimeMs = 150,
                Depth = 2,
                Outlinks = 5,
                H1Count = 1,
                Noindex = true,
                ImagesTotal = 4,
                ReadingLevel = 7.5,
                ContentHtmlRatio = 12.3456,
                PageAnalysisJson = """{"internal_link_count": 3, "external_link_count": 1}""",
            },
        };

        var inDegree = new Dictionary<string, int> { ["https://a.com/p"] = 9 };
        var mlBundle = JsonSerializer.Deserialize<Dictionary<string, object?>>(
            """
            {
              "language_by_url": {"https://a.com/p": "en"},
              "keyphrases_by_url": {"https://a.com/p": ["seo", "audit"]},
              "url_duplicate_group_id": {"https://a.com/p": 4}
            }
            """)!;

        var links = LinksListBuilder.BuildLinksList(rows, inDegree, null, mlBundle);

        Assert.Single(links);
        var r = links[0];
        Assert.Equal("https://a.com/p", r["url"]);
        Assert.Equal(9, r["inlinks"]);
        Assert.Equal(1234, r["content_length"]);
        Assert.Equal(300, r["word_count"]);
        Assert.Equal(150, r["response_time_ms"]);
        Assert.Equal(2, r["depth"]);
        Assert.Equal(5, r["outlinks"]);
        Assert.Equal(1, r["h1_count"]);
        Assert.Equal(true, r["noindex"]);
        Assert.Equal(7.5, r["reading_level"]);
        Assert.Equal(12.35, r["content_html_ratio"]);
        Assert.Equal(3, r["internal_link_count"]);
        Assert.Equal(1, r["external_link_count"]);
        Assert.Equal("en", r["detected_language"]);
        Assert.Equal(new[] { "seo", "audit" }, Assert.IsType<List<object?>>(r["keyphrases"]).Select(x => x?.ToString()).ToArray());
        Assert.Equal(4, Convert.ToInt32(r["duplicate_group_id"]));
        Assert.True(r.ContainsKey("lighthouse"));
    }

    [Fact]
    public void BuildLinksList_skips_blank_urls()
    {
        var rows = new List<CrawlRow>
        {
            new() { Url = "", Status = "200" },
            new() { Url = "   ", Status = "200" },
        };

        Assert.Empty(LinksListBuilder.BuildLinksList(rows, new Dictionary<string, int>(), null, null));
    }

    [Fact]
    public void BuildOrphanUrls_lists_zero_inlink_pages()
    {
        var links = new List<Dictionary<string, object?>>
        {
            new() { ["url"] = "https://a.com/orphan", ["inlinks"] = 0 },
            new() { ["url"] = "https://a.com/hub", ["inlinks"] = 3 },
        };

        var orphans = LinksListBuilder.BuildOrphanUrls(links);
        Assert.Single(orphans);
        Assert.Equal("https://a.com/orphan", orphans[0]);
    }
}
