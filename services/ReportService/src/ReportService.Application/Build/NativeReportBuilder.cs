using System.Text.Json;
using System.Text.Json.Nodes;
using ReportService.Application.Bridge;
using ReportService.Application.Build.Categories;
using ReportService.Application.Integrations;
using ReportService.Application.Repositories;

namespace ReportService.Application.Build;

/// <summary>Native report build orchestration. Core sections are native; enrichments (Google, security scan) remain optional stubs.</summary>
public sealed class NativeReportBuilder(
    CrawlRepository crawlRepository,
    CrawlEdgesReader crawlEdgesReader,
    LighthouseDbReader lighthouseDbReader,
    LinkEdgesReader linkEdgesReader,
    IntegrationsReportDataClient integrationsReportData,
    AiServiceEnrichmentClient aiServiceEnrichment,
    CrawlPageHtmlReader crawlPageHtmlReader,
    IHttpClientFactory httpClientFactory,
    SitemapDiscoveryService sitemapDiscovery,
    SiteLevelBuilder siteLevelBuilder,
    SubdomainInventoryBuilder subdomainInventoryBuilder,
    CategoryBuilder categoryBuilder,
    ReportPayloadWriter reportPayloadWriter)
{
    /// <summary>Native build writes a full UI payload without runtime ML enrichment.</summary>
    public bool IsFullBuildComplete => true;

    public async Task<NativeReportSlice> BuildNativeSliceAsync(
        long? propertyId,
        long? crawlRunId,
        IReadOnlyDictionary<string, string>? config,
        IReadOnlyDictionary<string, object?>? mlBundle = null,
        CancellationToken cancellationToken = default)
    {
        var startUrl = config?.GetValueOrDefault("start_url")?.Trim() ?? "";
        var siteName = config?.GetValueOrDefault("site_name")?.Trim();
        var reportTitle = config?.GetValueOrDefault("report_title")?.Trim();

        var resolvedRunId = await crawlRepository.ResolveCrawlRunIdAsync(
            propertyId,
            startUrl,
            crawlRunId,
            cancellationToken);
        if (resolvedRunId is null)
        {
            throw new InvalidOperationException("No crawl run found in database. Run crawl first.");
        }

        crawlRunId = resolvedRunId;
        var rows = await crawlRepository.ReadCrawlAsync(crawlRunId, cancellationToken);
        mlBundle ??= LocalEnrichmentBuilder.RunLocalEnrichment(rows, config);
        var linkEdgeRows = await linkEdgesReader.ReadAsync(crawlRunId, cancellationToken: cancellationToken);
        var crawlGraphEdges = await crawlEdgesReader.ReadAsync(crawlRunId, cancellationToken);
        var edges = ReportEdgeResolver.Resolve(rows, crawlGraphEdges, linkEdgeRows);
        if (rows.Count == 0 && edges.Count == 0)
        {
            throw new InvalidOperationException("No crawl or edges data in database. Run crawl first.");
        }

        var lhDb = await lighthouseDbReader.ReadPageSummariesAsync(cancellationToken);
        var crawlRunCreatedAt = await crawlRepository.GetCrawlRunCreatedAtIsoAsync(crawlRunId, cancellationToken);

        var enrichment = propertyId is > 0
            ? await integrationsReportData.FetchAsync(propertyId.Value, cancellationToken)
            : null;
        var googleData = enrichment?.Google;
        var keywordsData = enrichment?.Keywords;
        var gscLinksData = enrichment?.GscLinks;

        var seo = SeoSummaryBuilder.Compute(rows);
        var globalLhSummary = await lighthouseDbReader.ReadGlobalSummaryAsync(cancellationToken);
        var expectedHost = LighthouseReportMerge.DeriveExpectedHost(startUrl, rows.Select(r => r.Url));
        var lhByUrl = LighthouseReportAssembler.BuildLighthouseByUrl(lhDb, rows, startUrl);
        if (lhByUrl.Count > 0 && !string.IsNullOrEmpty(expectedHost))
        {
            lhByUrl = LighthouseReportMerge.FilterLighthouseByHost(lhByUrl, expectedHost);
        }

        var pickedLhNode = LighthouseReportMerge.PickLighthouseSummary(lhByUrl, startUrl, globalLhSummary, expectedHost);
        var lighthouseSummary = LighthouseJsonHelper.NodeToDictionary(pickedLhNode);

        var meta = ReportMetadataBuilder.BuildReportMetadata(
            rows,
            config,
            pickedLhNode,
            googleData,
            keywordsData,
            mlBundle,
            crawlRunId,
            crawlRunCreatedAt,
            gscLinksData);

        var maxOutbound = ParseOutboundMaxRows(config);
        var fingerprints = ReportMetadataBuilder.BuildUrlFingerprints(rows);
        var hreflang = ReportMetadataBuilder.BuildHreflangSummary(rows);
        var outbound = ReportMetadataBuilder.BuildOutboundLinkDomains(rows, startUrl, maxOutbound);
        var summarySeo = BuildSummarySeoPayload(seo.Issues);
        var siteLevel = await siteLevelBuilder.FetchAsync(startUrl, cancellationToken);
        siteLevel = MergeSiteLevelConfig(siteLevel, config);
        var runSecurityScan = ParseBool(config, "run_security_scan", defaultValue: true);
        var securityFindings = SecurityScanBuilder.BuildPassive(rows, startUrl, runSecurityScan);
        Dictionary<string, object?>? cruxSummary = null;
        if (ParseBool(config, "enable_crux", defaultValue: false) && !string.IsNullOrWhiteSpace(startUrl))
        {
            cruxSummary = await CruxOriginMetricsFetcher.FetchAsync(httpClientFactory, startUrl, cancellationToken);
        }

        var categories = categoryBuilder.BuildCategories(
            rows,
            edges,
            summarySeo,
            siteLevel,
            startUrl,
            lighthouseSummary,
            cruxSummary: cruxSummary,
            lighthouseByUrl: lhByUrl,
            mlBundle: mlBundle,
            securityFindings: securityFindings);

        var categoryList = categories.ToList();

        var (auditedCategories, optionalAuditMeta) = await OptionalAuditsBuilder.ApplyAsync(
            categoryList,
            rows,
            config,
            crawlRunId,
            crawlPageHtmlReader,
            httpClientFactory,
            cancellationToken);
        categoryList = auditedCategories.ToList();

        var gapLimit = int.TryParse(config?.GetValueOrDefault("google_url_gap_list_limit"), out var gl) ? gl : 200;
        var indexation = await IndexationCoverageBuilder.BuildAsync(
            rows,
            startUrl,
            googleData,
            sitemapDiscovery,
            gapLimit,
            cancellationToken);
        categoryBuilder.MergeIndexationIssues(categoryList, rows, indexation);

        var subdomains = await subdomainInventoryBuilder.BuildAsync(
            rows,
            indexation,
            startUrl,
            config,
            cancellationToken);
        categoryBuilder.MergeSubdomainIssues(categoryList, subdomains);

        var crawlPathSegments = ParsePathPrefixes(config);
        var crawlSegments = crawlPathSegments.Count > 0
            ? CrawlSegmentsBuilder.Build(rows, categoryList, crawlPathSegments)
            : null;

        var contactIntelligence = await ContactIntelligenceBuilder.BuildAsync(
            rows,
            siteLevel,
            startUrl,
            siteLevelBuilder,
            config,
            cancellationToken);

        var (imageInventory, imageInventorySummary) = ImageInventoryBuilder.Build(rows, config);

        if (googleData is not null)
        {
            categoryList = IssueImpactEnricher.Enrich(categoryList, googleData).ToList();
            var searchPerformance = SearchPerformanceCategoryBuilder.Build(googleData);
            if (searchPerformance is not null)
            {
                categoryList.Add(searchPerformance);
            }
        }

        var inDegree = LinksListBuilder.BuildInDegree(edges);
        var links = LinksListBuilder.BuildLinksList(rows, inDegree, lhByUrl, mlBundle);
        var orphanUrls = LinksListBuilder.BuildOrphanUrls(links);
        var successRows = CategoryHelpers.SuccessRows(rows);
        var contentUrls = ContentUrlListsBuilder.Build(rows, successRows);
        var contentAnalytics = ContentAnalyticsBuilder.BuildContentAnalytics(rows);
        var keywordOpportunities = KeywordOpportunitiesBuilder.Build(rows, config, googleData);
        var semanticKeywordClusters = await BuildSemanticKeywordClustersAsync(
            contentAnalytics,
            mlBundle,
            cancellationToken);
        var optionalAuditUrls = OptionalAuditUrlsBuilder.Build(categoryList);
        var responseTimeStats = ContentAnalyticsBuilder.BuildResponseTimeStats(rows);
        var depthDistribution = ContentAnalyticsBuilder.BuildDepthDistribution(rows);
        var chartData = ReportChartDataBuilder.Build(rows);
        var maxNodesPlot = int.TryParse(config?.GetValueOrDefault("max_nodes_plot"), out var mnp) ? mnp : 300;
        var graph = ReportGraphBuilder.Build(rows, edges, maxNodesPlot);
        var textContentAnalysis = ContentAnalyticsBuilder.BuildTextContentAnalysis(rows);
        var socialCoverage = ContentAnalyticsBuilder.BuildSocialCoverage(rows);
        var techStackSummary = ContentAnalyticsBuilder.BuildTechStackSummary(rows);
        var hreflangIssueUrls = HreflangIssueUrlsBuilder.Build(successRows);
        var linkEdges = LinkEdgesReportBuilder.ToPayloadRows(linkEdgeRows);
        var linkRelSummary = linkEdges.Count > 0
            ? LinkEdgesReportBuilder.SummarizeLinkRel(linkEdges)
            : new Dictionary<string, object?>();
        var inlinkAnchorMatrix = linkEdges.Count > 0
            ? LinkEdgesReportBuilder.BuildInlinkAnchorMatrix(linkEdges)
            : [];
        var lighthouseFailureUrls = LighthouseFailureUrlsBuilder.Build(lhByUrl);
        var competitorGap = CompetitorLinkGapBuilder.Build(gscLinksData, ParseCompetitorDomains(config));

        var slice = new NativeReportSlice(
            rows.Count,
            seo.Summary,
            seo.SeoHealth,
            seo.Issues,
            seo.Recommendations,
            meta,
            fingerprints,
            hreflang,
            outbound,
            lhByUrl,
            edges,
            categoryList,
            links,
            orphanUrls,
            contentUrls,
            contentAnalytics,
            responseTimeStats,
            depthDistribution,
            chartData,
            graph,
            textContentAnalysis,
            socialCoverage,
            techStackSummary,
            hreflangIssueUrls,
            linkEdges,
            linkRelSummary,
            inlinkAnchorMatrix,
            googleData,
            keywordsData,
            gscLinksData,
            indexation,
            competitorGap,
            securityFindings,
            lighthouseSummary,
            CruxSummary: cruxSummary,
            ContactIntelligence: contactIntelligence,
            ImageInventory: imageInventory,
            ImageInventorySummary: imageInventorySummary,
            Subdomains: subdomains,
            CrawlSegments: crawlSegments,
            LighthouseFailureUrls: lighthouseFailureUrls,
            KeywordOpportunities: keywordOpportunities,
            SemanticKeywordClusters: semanticKeywordClusters,
            OptionalAuditUrls: optionalAuditUrls,
            OptionalAuditMeta: optionalAuditMeta);

        var corePayload = NativeReportPayloadAssembler.AssembleCore(
            slice,
            siteName,
            reportTitle,
            siteLevel,
            mlBundle);

        return slice with { CorePayload = corePayload, MlBundle = mlBundle };
    }

    public async Task<ReportBuildBridgeResult> BuildAsync(
        long propertyId,
        long? crawlRunId,
        IReadOnlyDictionary<string, string>? config,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var slice = await BuildNativeSliceAsync(propertyId, crawlRunId, config, null, cancellationToken);
            var siteName = config?.GetValueOrDefault("site_name")?.Trim();
            var reportTitle = config?.GetValueOrDefault("report_title")?.Trim();
            var resolvedRunId = await crawlRepository.ResolveCrawlRunIdAsync(
                propertyId,
                config?.GetValueOrDefault("start_url"),
                crawlRunId,
                cancellationToken);
            var crawlRunCreatedAt = await crawlRepository.GetCrawlRunCreatedAtIsoAsync(resolvedRunId, cancellationToken);

            var payload = NativeReportPayloadAssembler.AssembleFull(
                slice,
                siteName,
                reportTitle,
                propertyId,
                resolvedRunId,
                crawlRunCreatedAt,
                mlBundle: slice.MlBundle);

            var reportId = await reportPayloadWriter.WriteAsync(payload, propertyId, cancellationToken);
            var outputPath = "postgresql";
            var log = $"Native report build completed (report_payload id={reportId})";
            var rawBody = JsonSerializer.Serialize(new
            {
                ok = true,
                exitCode = 0,
                log,
                outputPath,
                reportId,
            });

            return new ReportBuildBridgeResult(true, 0, log, outputPath, rawBody);
        }
        catch (Exception ex)
        {
            var log = ex.ToString();
            var rawBody = JsonSerializer.Serialize(new { ok = false, exitCode = 1, log, outputPath = (string?)null });
            return new ReportBuildBridgeResult(false, 1, log, null, rawBody);
        }
    }

    private async Task<List<Dictionary<string, object?>>> BuildSemanticKeywordClustersAsync(
        Dictionary<string, object?> contentAnalytics,
        IReadOnlyDictionary<string, object?>? mlBundle,
        CancellationToken cancellationToken)
    {
        var words = new List<string>();
        if (contentAnalytics.TryGetValue("top_keywords_site", out var topObj)
            && topObj is IEnumerable<Dictionary<string, object?>> topKeywords)
        {
            foreach (var item in topKeywords)
            {
                var word = item.GetValueOrDefault("word")?.ToString()?.Trim();
                if (!string.IsNullOrEmpty(word) && !TextHygieneHelper.IsJunkSemanticTerm(word))
                {
                    words.Add(word);
                }
            }
        }

        if (words.Count < 2)
        {
            return [];
        }

        try
        {
            return await aiServiceEnrichment.TryClusterKeywordsAsync(words, cancellationToken);
        }
        catch (Exception ex)
        {
            if (mlBundle is Dictionary<string, object?> mutable)
            {
                if (!mutable.TryGetValue("ml_errors", out var errorsObj)
                    || errorsObj is not List<object?> errors)
                {
                    errors = [];
                    mutable["ml_errors"] = errors;
                }

                errors.Add(ex.Message);
            }

            return [];
        }
    }

    private static Dictionary<string, object?> BuildSummarySeoPayload(
        Dictionary<string, List<Dictionary<string, string>>> issues)
    {
        issues.TryGetValue("broken", out var broken);
        issues.TryGetValue("redirects", out var redirects);
        broken ??= [];
        redirects ??= [];

        return new Dictionary<string, object?>
        {
            ["issues"] = new Dictionary<string, object?>
            {
                ["broken"] = broken,
                ["redirects"] = redirects,
            },
        };
    }

    private static int ParseOutboundMaxRows(IReadOnlyDictionary<string, string>? config)
    {
        if (config is not null
            && int.TryParse(config.GetValueOrDefault("outbound_domain_max_rows"), out var primary)
            && primary > 0)
        {
            return primary;
        }

        if (config is not null
            && int.TryParse(config.GetValueOrDefault("max_outbound_domains"), out var legacy)
            && legacy > 0)
        {
            return legacy;
        }

        return 200;
    }

    private static bool ParseBool(IReadOnlyDictionary<string, string>? config, string key, bool defaultValue)
    {
        if (config is null || !config.TryGetValue(key, out var raw))
        {
            return defaultValue;
        }

        return raw.Trim().ToLowerInvariant() switch
        {
            "0" or "false" or "no" or "off" => false,
            "1" or "true" or "yes" or "on" => true,
            _ => defaultValue,
        };
    }

    private static List<string> ParsePathPrefixes(IReadOnlyDictionary<string, string>? config)
    {
        if (config is null || !config.TryGetValue("crawl_path_segments", out var raw))
        {
            return [];
        }

        return raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(s => s.Length > 0)
            .ToList();
    }

    private static List<string> ParseCompetitorDomains(IReadOnlyDictionary<string, string>? config)
    {
        if (config is null || !config.TryGetValue("competitor_domains", out var raw))
        {
            return [];
        }

        return raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(s => s.Length > 0)
            .ToList();
    }

    private static Dictionary<string, object?> MergeSiteLevelConfig(
        IReadOnlyDictionary<string, object?>? siteLevel,
        IReadOnlyDictionary<string, string>? config)
    {
        var merged = siteLevel is Dictionary<string, object?> dict
            ? new Dictionary<string, object?>(dict)
            : siteLevel?.ToDictionary(kv => kv.Key, kv => kv.Value)
              ?? new Dictionary<string, object?>();

        merged["enable_ads_txt_check"] = ParseBool(config, "enable_ads_txt_check", defaultValue: false);
        merged["enable_security_txt_check"] = ParseBool(config, "enable_security_txt_check", defaultValue: false);
        return merged;
    }
}

public sealed record NativeReportSlice(
    int CrawlRowCount,
    Dictionary<string, object?> Summary,
    Dictionary<string, int> SeoHealth,
    Dictionary<string, List<Dictionary<string, string>>> Issues,
    List<string> Recommendations,
    Dictionary<string, object?> ReportMeta,
    List<Dictionary<string, object?>> UrlFingerprints,
    Dictionary<string, object?> HreflangSummary,
    List<Dictionary<string, object?>> OutboundLinkDomains,
    Dictionary<string, JsonNode> LighthouseByUrl,
    IReadOnlyList<(string From, string To)> Edges,
    IReadOnlyList<ReportCategory> Categories,
    List<Dictionary<string, object?>> Links,
    List<string> OrphanUrls,
    Dictionary<string, List<Dictionary<string, object?>>> ContentUrls,
    Dictionary<string, object?> ContentAnalytics,
    Dictionary<string, object?> ResponseTimeStats,
    Dictionary<string, object?> DepthDistribution,
    ReportChartData ChartData,
    ReportGraphResult Graph,
    Dictionary<string, object?> TextContentAnalysis,
    Dictionary<string, object?> SocialCoverage,
    Dictionary<string, object?> TechStackSummary,
    List<Dictionary<string, object?>> HreflangIssueUrls,
    List<Dictionary<string, object?>> LinkEdges,
    Dictionary<string, object?> LinkRelSummary,
    List<Dictionary<string, object?>> InlinkAnchorMatrix,
    Dictionary<string, object?>? GoogleData = null,
    Dictionary<string, object?>? KeywordsData = null,
    Dictionary<string, object?>? GscLinksData = null,
    Dictionary<string, object?>? IndexationCoverage = null,
    Dictionary<string, object?>? CompetitorLinkGap = null,
    List<Dictionary<string, object?>>? SecurityFindings = null,
    Dictionary<string, object?>? LighthouseSummary = null,
    Dictionary<string, object?>? CruxSummary = null,
    Dictionary<string, object?>? ContactIntelligence = null,
    List<Dictionary<string, object?>>? ImageInventory = null,
    Dictionary<string, object?>? ImageInventorySummary = null,
    Dictionary<string, object?>? Subdomains = null,
    Dictionary<string, object?>? CrawlSegments = null,
    Dictionary<string, object?>? LighthouseFailureUrls = null,
    Dictionary<string, object?>? KeywordOpportunities = null,
    List<Dictionary<string, object?>>? SemanticKeywordClusters = null,
    Dictionary<string, object?>? OptionalAuditUrls = null,
    Dictionary<string, object?>? OptionalAuditMeta = null,
    IReadOnlyDictionary<string, object?>? MlBundle = null)
{
    public Dictionary<string, object?>? CorePayload { get; init; }
}
