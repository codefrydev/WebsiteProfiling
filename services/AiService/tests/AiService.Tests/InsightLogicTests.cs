using System.Text.Json.Nodes;
using AiService.Tools.Handlers.Insight;
using AiService.Tools.Slice;

namespace AiService.Tests;

/// <summary>Parity tests for the native GSC/GA4 insight port (mirrors Python insight_helpers).</summary>
public sealed class InsightLogicTests
{
    [Theory]
    [InlineData("https://www.example.com/blog/", "example.com/blog/")]
    [InlineData("https://example.com/", "example.com/")]
    [InlineData("https://www.example.com", "example.com/")]
    [InlineData("/blog/post/", "/blog/post/")]
    [InlineData("HTTP://Example.com/A", "example.com/A")]
    [InlineData("https://x.com/a?q=1#frag", "x.com/a")]
    public void NormalizeUrl_matches_python(string input, string expected)
    {
        Assert.Equal(expected, GoogleUrl.NormalizeUrl(input));
    }

    [Theory]
    [InlineData("https://x.com/a/b", "/a/b")]
    [InlineData("https://x.com", "/")]
    [InlineData("/just/path", "/just/path")]
    public void UrlToPath_matches_python(string input, string expected)
    {
        Assert.Equal(expected, GoogleUrl.UrlToPath(input));
    }

    [Fact]
    public void StripWwwPrefix_only_removes_single_leading_label()
    {
        Assert.Equal("washington.edu", GoogleUrl.StripWwwPrefix("www.washington.edu"));
        Assert.Equal("example.com", GoogleUrl.StripWwwPrefix("example.com"));
    }

    [Fact]
    public void TrafficHealthRatio_no_data()
    {
        var health = InsightLogic.TrafficHealthRatio(Obj("{}"), Obj("{}"));
        Assert.Equal("no_data", health["diagnosis"]!.GetValue<string>());
        Assert.Null(health["ratio"]);
    }

    [Theory]
    [InlineData(100, 20, "tracking_gap")]
    [InlineData(100, 150, "healthy")]
    [InlineData(10, 40, "filter_issue")]
    public void TrafficHealthRatio_diagnoses_by_ratio(int clicks, int sessions, string expected)
    {
        var health = InsightLogic.TrafficHealthRatio(
            Obj($$"""{"clicks": {{clicks}}}"""),
            Obj($$"""{"sessions": {{sessions}}}"""));
        Assert.Equal(expected, health["diagnosis"]!.GetValue<string>());
    }

    [Theory]
    [InlineData(200, 10, 50, "high_impact")]
    [InlineData(200, 10, 0, "worth_optimizing")]
    [InlineData(10, 2, 100, "good_but_capped")]
    [InlineData(10, 50, 0, "low_priority")]
    public void ClassifyOpportunityQuadrant_matches_python(int impressions, int position, int sessions, string expected)
    {
        var gsc = Obj($$"""{"impressions": {{impressions}}, "position": {{position}}}""");
        var ga4 = sessions > 0 ? Obj($$"""{"sessions": {{sessions}}}""") : null;
        Assert.Equal(expected, InsightLogic.ClassifyOpportunityQuadrant(gsc, ga4, siteMedianSessions: 0));
    }

    [Fact]
    public void BlendLandingPages_joins_sorts_and_classifies()
    {
        var byPage = Obj("""
            {
              "https://x.com/a": {"clicks": 10, "impressions": 200, "position": 10, "ctr": 0.05},
              "https://x.com/b": {"clicks": 50, "impressions": 50, "position": 2, "ctr": 0.1}
            }
            """);
        var byPath = Obj("""
            {
              "/a": {"full_url": "https://x.com/a", "sessions": 80, "engagementRate": 0.6}
            }
            """);

        var rows = InsightLogic.BlendLandingPages(byPage, byPath, limit: 30, minImpressions: 1);

        Assert.Equal(2, rows.Count);
        // Sorted by clicks desc: /b (50 clicks) first.
        var first = (JsonObject)rows[0]!;
        Assert.Equal("https://x.com/b", first["url"]!.GetValue<string>());
        Assert.Equal("low_priority", first["quadrant"]!.GetValue<string>());
        Assert.Equal(0L, first["ga4_sessions"]!.GetValue<long>());

        var second = (JsonObject)rows[1]!;
        Assert.Equal("https://x.com/a", second["url"]!.GetValue<string>());
        Assert.Equal("high_impact", second["quadrant"]!.GetValue<string>());
        Assert.Equal(80L, second["ga4_sessions"]!.GetValue<long>());
    }

    [Fact]
    public void BlendLandingPages_filters_below_min_impressions()
    {
        var byPage = Obj("""
            {
              "https://x.com/low": {"clicks": 1, "impressions": 0, "position": 5},
              "https://x.com/ok": {"clicks": 1, "impressions": 5, "position": 5}
            }
            """);

        // parse_limit floors min_impressions to 1, so the 0-impression page is dropped.
        var rows = InsightLogic.BlendLandingPages(byPage, Obj("{}"), limit: 30, minImpressions: 1);

        Assert.Single(rows);
        Assert.Equal("https://x.com/ok", ((JsonObject)rows[0]!)["url"]!.GetValue<string>());
    }

    private static JsonObject Obj(string json) => (JsonObject)JsonNode.Parse(json)!;
}
