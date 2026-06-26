using ReportService.Application.Build;
using ReportService.Application.Repositories;

namespace ReportService.Tests;

public sealed class NativeReportPayloadAssemblerTests
{
    [Fact]
    public void AssembleCore_includes_categories_and_native_build_meta()
    {
        var categories = new List<ReportCategory>
        {
            new("technical_seo", "Technical SEO", 90, [], []),
            new("intelligence", "Content quality", 100, [], []),
        };

        var slice = new NativeReportSlice(
            CrawlRowCount: 5,
            Summary: new Dictionary<string, object?> { ["total_urls"] = 5 },
            SeoHealth: new Dictionary<string, int>(),
            Issues: new Dictionary<string, List<Dictionary<string, string>>>
            {
                ["broken"] = [],
                ["redirects"] = [],
            },
            Recommendations: [],
            ReportMeta: new Dictionary<string, object?> { ["start_url"] = "https://example.com/" },
            UrlFingerprints: [],
            HreflangSummary: new Dictionary<string, object?>(),
            OutboundLinkDomains: [],
            LighthouseByUrl: new Dictionary<string, System.Text.Json.Nodes.JsonNode>(),
            Edges: [],
            Categories: categories,
            Links: [],
            OrphanUrls: [],
            ContentUrls: ContentUrlListsBuilder.Build([], []),
            ContentAnalytics: ContentAnalyticsBuilder.BuildContentAnalytics([]),
            ResponseTimeStats: ContentAnalyticsBuilder.BuildResponseTimeStats([]),
            DepthDistribution: ContentAnalyticsBuilder.BuildDepthDistribution([]),
            ChartData: ReportChartDataBuilder.Build([]),
            Graph: ReportGraphBuilder.Build([], []),
            TextContentAnalysis: ContentAnalyticsBuilder.BuildTextContentAnalysis([]),
            SocialCoverage: ContentAnalyticsBuilder.BuildSocialCoverage([]),
            TechStackSummary: ContentAnalyticsBuilder.BuildTechStackSummary([]),
            HreflangIssueUrls: [],
            LinkEdges: [],
            LinkRelSummary: new Dictionary<string, object?>(),
            InlinkAnchorMatrix: []);

        var payload = NativeReportPayloadAssembler.AssembleCore(slice, "Example", "Audit");

        Assert.Equal("Example", payload["site_name"]);
        Assert.Equal(5, payload["summary"] is Dictionary<string, object?> s ? s["total_urls"] : null);

        var cats = Assert.IsType<List<Dictionary<string, object?>>>(payload["categories"]);
        Assert.Equal(2, cats.Count);
        Assert.Equal("intelligence", cats[1]["id"]);

        var nativeBuild = Assert.IsType<Dictionary<string, object?>>(payload["native_build"]);
        Assert.Equal(true, nativeBuild["partial"]);
        Assert.Equal(2, nativeBuild["category_count"]);
    }

    [Fact]
    public void AssembleFull_includes_charts_graph_and_native_flag()
    {
        var slice = new NativeReportSlice(
            CrawlRowCount: 2,
            Summary: new Dictionary<string, object?> { ["total_urls"] = 2 },
            SeoHealth: new Dictionary<string, int>(),
            Issues: new Dictionary<string, List<Dictionary<string, string>>>
            {
                ["broken"] = [],
                ["redirects"] = [],
            },
            Recommendations: [],
            ReportMeta: new Dictionary<string, object?>(),
            UrlFingerprints: [],
            HreflangSummary: new Dictionary<string, object?>(),
            OutboundLinkDomains: [],
            LighthouseByUrl: new Dictionary<string, System.Text.Json.Nodes.JsonNode>(),
            Edges: [],
            Categories: [],
            Links: [],
            OrphanUrls: [],
            ContentUrls: ContentUrlListsBuilder.Build([], []),
            ContentAnalytics: ContentAnalyticsBuilder.BuildContentAnalytics([]),
            ResponseTimeStats: ContentAnalyticsBuilder.BuildResponseTimeStats([]),
            DepthDistribution: ContentAnalyticsBuilder.BuildDepthDistribution([]),
            ChartData: ReportChartDataBuilder.Build([]),
            Graph: ReportGraphBuilder.Build([], []),
            TextContentAnalysis: ContentAnalyticsBuilder.BuildTextContentAnalysis([]),
            SocialCoverage: ContentAnalyticsBuilder.BuildSocialCoverage([]),
            TechStackSummary: ContentAnalyticsBuilder.BuildTechStackSummary([]),
            HreflangIssueUrls: [],
            LinkEdges: [],
            LinkRelSummary: new Dictionary<string, object?>(),
            InlinkAnchorMatrix: []);

        var payload = NativeReportPayloadAssembler.AssembleFull(slice, propertyId: 1, crawlRunId: 99);

        Assert.Equal(1L, payload["property_id"]);
        Assert.Equal(99L, payload["crawl_run_id"]);
        Assert.IsType<Dictionary<string, int>>(payload["status_counts"]);

        var nativeBuild = Assert.IsType<Dictionary<string, object?>>(payload["native_build"]);
        Assert.Equal(false, nativeBuild["partial"]);
        Assert.Equal(true, nativeBuild["native"]);
    }
}
