using CoreService.Api.Application.Build;

namespace CoreService.Tests;

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
        Assert.Equal(90, (payload["summary"] as Dictionary<string, object?>)!["site_health_score"]);
        Assert.Equal(90, payload["site_health_score"]);

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

    [Fact]
    public void AssembleFull_includes_keyword_and_optional_audit_fields_from_slice()
    {
        var keywordOpportunities = new Dictionary<string, object?>
        {
            ["quick_wins"] = new List<Dictionary<string, object?>> { new() { ["keyword"] = "seo" } },
            ["high_value"] = new List<Dictionary<string, object?>>(),
            ["token_topic_clusters"] = new List<Dictionary<string, object?>>(),
        };
        var optionalAuditUrls = new Dictionary<string, object?>
        {
            ["spell"] = Array.Empty<object>(),
            ["html"] = Array.Empty<object>(),
            ["amp"] = Array.Empty<object>(),
            ["pagination"] = new List<Dictionary<string, object?>> { new() { ["url"] = "https://example.com/p/2" } },
        };

        var slice = new NativeReportSlice(
            CrawlRowCount: 1,
            Summary: new Dictionary<string, object?> { ["total_urls"] = 1 },
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
            InlinkAnchorMatrix: [],
            KeywordOpportunities: keywordOpportunities,
            SemanticKeywordClusters: [new Dictionary<string, object?> { ["top_keyword"] = "seo" }],
            OptionalAuditUrls: optionalAuditUrls,
            OptionalAuditMeta: new Dictionary<string, object?> { ["pagination_issues"] = 1 });

        var payload = NativeReportPayloadAssembler.AssembleFull(slice);

        var kw = Assert.IsType<Dictionary<string, object?>>(payload["keyword_opportunities"]);
        var quickWins = Assert.IsType<List<Dictionary<string, object?>>>(kw["quick_wins"]);
        Assert.Single(quickWins);

        var semantic = Assert.IsType<List<Dictionary<string, object?>>>(payload["semantic_keyword_clusters"]);
        Assert.Single(semantic);

        var auditUrls = Assert.IsType<Dictionary<string, object?>>(payload["optional_audit_urls"]);
        var pagination = Assert.IsType<List<Dictionary<string, object?>>>(auditUrls["pagination"]);
        Assert.Single(pagination);

        Assert.Equal(1, payload["pagination_issues"]);
    }
}
