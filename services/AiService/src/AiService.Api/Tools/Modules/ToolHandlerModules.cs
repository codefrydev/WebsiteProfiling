using AiService.Api.Tools.Bridge;
using AiService.Api.Tools.Handlers.Backlinks;
using AiService.Api.Tools.Handlers.Core;
using AiService.Api.Tools.Handlers.Drift;
using AiService.Api.Tools.Handlers.Export;
using AiService.Api.Tools.Handlers.Geo;
using AiService.Api.Tools.Handlers.Google;
using AiService.Api.Tools.Handlers.Indexation;
using AiService.Api.Tools.Handlers.Insight;
using AiService.Api.Tools.Handlers.Integrations;
using AiService.Api.Tools.Handlers.Issues;
using AiService.Api.Tools.Handlers.Keywords;
using AiService.Api.Tools.Handlers.Links;
using AiService.Api.Tools.Handlers.Performance;
using AiService.Api.Tools.Handlers.Portfolio;
using AiService.Api.Tools.Handlers.Report;
using AiService.Api.Tools.Handlers.Schema;
using AiService.Api.Tools.Handlers.Security;
using AiService.Api.Tools.Handlers.Slice;
using AiService.Api.Tools.Registry;
using AiService.Api.Tools.Services.Citations;

namespace AiService.Api.Tools.Modules;

/// <summary>
/// Registers native C# audit tool handlers by domain. Extend one module at a time as tools are ported from Python.
/// </summary>
public static class ToolHandlerModules
{
    public static IEnumerable<IToolHandler> AllHandlers(IServiceProvider serviceProvider)
    {
        foreach (var handler in CoreModule(serviceProvider))
        {
            yield return handler;
        }

        foreach (var handler in PortfolioModule())
        {
            yield return handler;
        }

        foreach (var handler in IssuesModule())
        {
            yield return handler;
        }

        foreach (var handler in InsightModule())
        {
            yield return handler;
        }

        foreach (var handler in GoogleModule())
        {
            yield return handler;
        }

        foreach (var handler in IntegrationsModule(serviceProvider))
        {
            yield return handler;
        }

        foreach (var handler in PayloadSliceToolHandlers.AllHandlers())
        {
            yield return handler;
        }

        foreach (var handler in LinksModule())
        {
            yield return handler;
        }

        foreach (var handler in SecurityModule())
        {
            yield return handler;
        }

        foreach (var handler in SchemaModule())
        {
            yield return handler;
        }

        foreach (var handler in IndexationModule())
        {
            yield return handler;
        }

        foreach (var handler in BacklinksModule())
        {
            yield return handler;
        }

        foreach (var handler in PerformanceModule())
        {
            yield return handler;
        }

        foreach (var handler in GeoModule(serviceProvider))
        {
            yield return handler;
        }

        foreach (var handler in PayloadExtrasModule())
        {
            yield return handler;
        }

        foreach (var handler in ExportModule(serviceProvider))
        {
            yield return handler;
        }

        foreach (var handler in KeywordsModule())
        {
            yield return handler;
        }

        foreach (var handler in DriftModule())
        {
            yield return handler;
        }
    }

    public static IEnumerable<IToolHandler> DriftModule()
    {
        yield return new DelegatingToolHandler("compare_issue_deltas", DriftToolHandlers.CompareIssueDeltasAsync);
        yield return new DelegatingToolHandler("compare_category_deltas", DriftToolHandlers.CompareCategoryDeltasAsync);
        yield return new DelegatingToolHandler("compare_seo_health_deltas", DriftToolHandlers.CompareSeoHealthDeltasAsync);
        yield return new DelegatingToolHandler("compare_lighthouse_deltas", DriftToolHandlers.CompareLighthouseDeltasAsync);
        yield return new DelegatingToolHandler("compare_url_set_diff", DriftToolHandlers.CompareUrlSetDiffAsync);
        yield return new DelegatingToolHandler("compare_redirect_deltas", DriftToolHandlers.CompareRedirectDeltasAsync);
        yield return new DelegatingToolHandler("compare_link_metric_deltas", DriftToolHandlers.CompareLinkMetricDeltasAsync);
        yield return new DelegatingToolHandler("compare_security_deltas", DriftToolHandlers.CompareSecurityDeltasAsync);
        yield return new DelegatingToolHandler("compare_duplicate_deltas", DriftToolHandlers.CompareDuplicateDeltasAsync);
        yield return new DelegatingToolHandler("compare_tech_deltas", DriftToolHandlers.CompareTechDeltasAsync);
        yield return new DelegatingToolHandler("compare_content_metrics", DriftToolHandlers.CompareContentMetricsAsync);
        yield return new DelegatingToolHandler("compare_google_metrics", DriftToolHandlers.CompareGoogleMetricsAsync);
        yield return new DelegatingToolHandler("compare_priority_counts", DriftToolHandlers.ComparePriorityCountsAsync);
        yield return new DelegatingToolHandler("compare_health_score_delta", DriftToolHandlers.CompareHealthScoreDeltaAsync);
        yield return new DelegatingToolHandler("compare_indexation_deltas", DriftToolHandlers.CompareIndexationDeltasAsync);
        yield return new DelegatingToolHandler("compare_orphan_deltas", DriftToolHandlers.CompareOrphanDeltasAsync);
        yield return new DelegatingToolHandler("compare_reports", DriftToolHandlers.CompareReportsAsync);
        yield return new DelegatingToolHandler("list_compare_new_issues", DriftToolHandlers.ListCompareNewIssuesAsync);
        yield return new DelegatingToolHandler("list_compare_resolved_issues", DriftToolHandlers.ListCompareResolvedIssuesAsync);
        yield return new DelegatingToolHandler("list_compare_new_urls", DriftToolHandlers.ListCompareNewUrlsAsync);
        yield return new DelegatingToolHandler("list_compare_removed_urls", DriftToolHandlers.ListCompareRemovedUrlsAsync);
        yield return new DelegatingToolHandler("list_compare_lighthouse_regressions", DriftToolHandlers.ListCompareLighthouseRegressionsAsync);
        yield return new DelegatingToolHandler("list_compare_traffic_losers", DriftToolHandlers.ListCompareTrafficLosersAsync);
        yield return new DelegatingToolHandler("get_health_history", DriftToolHandlers.GetHealthHistoryAsync);
    }

    public static IEnumerable<IToolHandler> KeywordsModule()
    {
        yield return new DelegatingToolHandler("get_keyword_summary", KeywordsToolHandlers.GetKeywordSummaryAsync);
        yield return new DelegatingToolHandler("search_keywords", KeywordsToolHandlers.SearchKeywordsAsync);
        yield return new DelegatingToolHandler("get_striking_distance_keywords", KeywordsToolHandlers.GetStrikingDistanceKeywordsAsync);
        yield return new DelegatingToolHandler("get_keyword_cannibalisation", KeywordsToolHandlers.GetKeywordCannibalisationAsync);
        yield return new DelegatingToolHandler("get_query_page_misalignment", KeywordsToolHandlers.GetQueryPageMisalignmentAsync);
        yield return new DelegatingToolHandler("list_cannibalisation_queries", KeywordsToolHandlers.ListCannibalisationQueriesAsync);
        yield return new DelegatingToolHandler("list_misaligned_queries", KeywordsToolHandlers.ListMisalignedQueriesAsync);
        yield return new DelegatingToolHandler("get_keyword_history", KeywordsToolHandlers.GetKeywordHistoryAsync);
        yield return new DelegatingToolHandler("get_keyword_serp_overlay", KeywordsToolHandlers.GetKeywordSerpOverlayAsync);
        yield return new DelegatingToolHandler("list_keywords_by_action", KeywordsToolHandlers.ListKeywordsByActionAsync);
        yield return new DelegatingToolHandler("list_keywords_by_position", KeywordsToolHandlers.ListKeywordsByPositionAsync);
        yield return new DelegatingToolHandler("list_keywords_by_impressions", KeywordsToolHandlers.ListKeywordsByImpressionsAsync);
        yield return new DelegatingToolHandler("get_brand_keyword_split", KeywordsToolHandlers.GetBrandKeywordSplitAsync);
        yield return new DelegatingToolHandler("list_keywords_by_intent", KeywordsToolHandlers.ListKeywordsByIntentAsync);
        yield return new DelegatingToolHandler("list_keyword_rank_improvements", KeywordsToolHandlers.ListKeywordRankImprovementsAsync);
        yield return new DelegatingToolHandler("list_keyword_rank_declines", KeywordsToolHandlers.ListKeywordRankDeclinesAsync);
        yield return new DelegatingToolHandler("list_keywords_new_to_top_10", KeywordsToolHandlers.ListKeywordsNewToTop10Async);
        yield return new DelegatingToolHandler("list_keywords_fell_out_of_top_10", KeywordsToolHandlers.ListKeywordsFellOutOfTop10Async);
        yield return new DelegatingToolHandler("list_cannibalisation_urls", KeywordsToolHandlers.ListCannibalisationUrlsAsync);
        yield return new DelegatingToolHandler("list_keywords_by_recommended_action", KeywordsToolHandlers.ListKeywordsByRecommendedActionAsync);
        yield return new DelegatingToolHandler("list_keywords_by_serp_feature", KeywordsToolHandlers.ListKeywordsBySerpFeatureAsync);
        yield return new DelegatingToolHandler("list_semantic_cluster_queries", KeywordsToolHandlers.ListSemanticClusterQueriesAsync);
        yield return new DelegatingToolHandler("list_semantic_cluster_pages", KeywordsToolHandlers.ListSemanticClusterPagesAsync);
        yield return new DelegatingToolHandler("get_keyword_opportunity_score", KeywordsToolHandlers.GetKeywordOpportunityScoreAsync);
        yield return new DelegatingToolHandler("list_keywords_near_page_one", KeywordsToolHandlers.ListKeywordsNearPageOneAsync);
        yield return new DelegatingToolHandler("list_keywords_high_impression_zero_click", KeywordsToolHandlers.ListKeywordsHighImpressionZeroClickAsync);
        yield return new DelegatingToolHandler("list_keywords_by_competition_band", KeywordsToolHandlers.ListKeywordsByCompetitionBandAsync);
        yield return new DelegatingToolHandler("get_keyword_serp_snapshot", KeywordsToolHandlers.GetKeywordSerpSnapshotAsync);
        yield return new DelegatingToolHandler("list_keywords_with_ai_overview", KeywordsToolHandlers.ListKeywordsWithAiOverviewAsync);
        yield return new DelegatingToolHandler("list_keywords_local_pack", KeywordsToolHandlers.ListKeywordsLocalPackAsync);
        yield return new DelegatingToolHandler("list_keywords_question_intent", KeywordsToolHandlers.ListKeywordsQuestionIntentAsync);
        yield return new DelegatingToolHandler("list_keywords_commercial_intent", KeywordsToolHandlers.ListKeywordsCommercialIntentAsync);
    }

    public static IEnumerable<IToolHandler> CoreModule(IServiceProvider serviceProvider)
    {
        var catalog = serviceProvider.GetRequiredService<ToolCatalog>();
        yield return new InjectingToolHandler(
            "search_audit_tools",
            (sp, conn, ctx, args, ct) => CoreToolHandlers.SearchAuditToolsAsync(catalog, conn, ctx, args, ct),
            serviceProvider);
        yield return new InjectingToolHandler(
            "list_tool_domains",
            (sp, conn, ctx, args, ct) => CoreToolHandlers.ListToolDomainsAsync(catalog, conn, ctx, args, ct),
            serviceProvider);
        yield return new DelegatingToolHandler(
            "get_data_coverage_report",
            CoreToolHandlers.GetDataCoverageReportAsync);
        yield return new InjectingToolHandler(
            "run_insight_workflow",
            WorkflowToolHandlers.RunInsightWorkflowAsync,
            serviceProvider);
        yield return new InjectingToolHandler(
            "run_technical_workflow",
            WorkflowToolHandlers.RunTechnicalWorkflowAsync,
            serviceProvider);
        yield return new InjectingToolHandler(
            "run_keyword_workflow",
            WorkflowToolHandlers.RunKeywordWorkflowAsync,
            serviceProvider);
        yield return new InjectingToolHandler(
            "run_domain_agent",
            WorkflowToolHandlers.RunDomainAgentAsync,
            serviceProvider);
    }

    public static IEnumerable<IToolHandler> PortfolioModule()
    {
        yield return new DelegatingToolHandler("get_report_summary", ReportToolHandlers.GetReportSummaryAsync);
        yield return new DelegatingToolHandler("get_category_scores", ReportToolHandlers.GetCategoryScoresAsync);
        yield return new DelegatingToolHandler("get_executive_summary", ReportToolHandlers.GetExecutiveSummaryAsync);
        yield return new DelegatingToolHandler("get_report_meta", ReportToolHandlers.GetReportMetaAsync);
        yield return new DelegatingToolHandler("get_site_level", ReportToolHandlers.GetSiteLevelAsync);
        yield return new DelegatingToolHandler("get_portfolio_summary", PortfolioToolHandlers.GetPortfolioSummaryAsync);
        yield return new DelegatingToolHandler("get_crawl_summary", PortfolioToolHandlers.GetCrawlSummaryAsync);
        yield return new DelegatingToolHandler("get_mime_type_breakdown", PortfolioToolHandlers.GetMimeTypeBreakdownAsync);
        yield return new DelegatingToolHandler("get_title_length_distribution", PortfolioToolHandlers.GetTitleLengthDistributionAsync);
        yield return new DelegatingToolHandler("get_domain_link_distribution", PortfolioToolHandlers.GetDomainLinkDistributionAsync);
        yield return new DelegatingToolHandler("get_outlink_distribution", PortfolioToolHandlers.GetOutlinkDistributionAsync);
        yield return new DelegatingToolHandler("get_issue_priority_breakdown", PortfolioToolHandlers.GetIssuePriorityBreakdownAsync);
        yield return new DelegatingToolHandler("get_top_crawled_pages", PortfolioToolHandlers.GetTopCrawledPagesAsync);
    }

    public static IEnumerable<IToolHandler> IssuesModule()
    {
        yield return new DelegatingToolHandler("list_issues", ReportToolHandlers.ListIssuesAsync);
        yield return new DelegatingToolHandler("get_critical_issues", ReportToolHandlers.GetCriticalIssuesAsync);
        yield return new DelegatingToolHandler("list_top_impact_issues", ReportToolHandlers.ListTopImpactIssuesAsync);
        yield return new DelegatingToolHandler("get_category_issues", IssuesToolHandlers.GetCategoryIssuesAsync);
        yield return new DelegatingToolHandler("list_issues_by_category", IssuesToolHandlers.ListIssuesByCategoryAsync);
    }

    public static IEnumerable<IToolHandler> InsightModule()
    {
        yield return new DelegatingToolHandler("get_landing_page_blended_table", InsightToolHandlers.GetLandingPageBlendedTableAsync);
        yield return new DelegatingToolHandler("get_opportunity_matrix", InsightToolHandlers.GetOpportunityMatrixAsync);
        yield return new DelegatingToolHandler("get_traffic_health_check", InsightToolHandlers.GetTrafficHealthCheckAsync);
        yield return new DelegatingToolHandler("get_landing_page_full_diagnosis", InsightToolHandlers.GetLandingPageFullDiagnosisAsync);
        yield return new DelegatingToolHandler("get_issue_to_traffic_map", InsightToolHandlers.GetIssueToTrafficMapAsync);
    }

    public static IEnumerable<IToolHandler> GoogleModule()
    {
        yield return new DelegatingToolHandler("get_google_summary", GoogleToolHandlers.GetGoogleSummaryAsync);
        yield return new DelegatingToolHandler("get_gsc_top_queries", GoogleToolHandlers.GetGscTopQueriesAsync);
        yield return new DelegatingToolHandler("get_gsc_top_pages", GoogleToolHandlers.GetGscTopPagesAsync);
        yield return new DelegatingToolHandler("get_ga4_summary", GoogleToolHandlers.GetGa4SummaryAsync);
        yield return new DelegatingToolHandler("get_gsc_page_query_slice", GoogleToolHandlers.GetGscPageQuerySliceAsync);
        yield return new DelegatingToolHandler("get_gsc_daily_trend", GoogleToolHandlers.GetGscDailyTrendAsync);
        yield return new DelegatingToolHandler("get_ga4_daily_trend", GoogleToolHandlers.GetGa4DailyTrendAsync);
        yield return new DelegatingToolHandler("get_ga4_by_device", GoogleToolHandlers.GetGa4ByDeviceAsync);
        yield return new DelegatingToolHandler("get_ga4_by_channel", GoogleToolHandlers.GetGa4ByChannelAsync);
        yield return new DelegatingToolHandler("get_gsc_page_queries", GoogleToolHandlers.GetGscPageQueriesAsync);
        yield return new DelegatingToolHandler("get_gsc_ctr_opportunity_pages", GoogleToolHandlers.GetGscCtrOpportunityPagesAsync);
        yield return new DelegatingToolHandler("list_gsc_queries_by_impressions", GoogleToolHandlers.ListGscQueriesByImpressionsAsync);
        yield return new DelegatingToolHandler("list_gsc_queries_by_clicks", GoogleToolHandlers.ListGscQueriesByClicksAsync);
        yield return new DelegatingToolHandler("list_gsc_pages_by_impressions", GoogleToolHandlers.ListGscPagesByImpressionsAsync);
        yield return new DelegatingToolHandler("list_gsc_pages_by_clicks", GoogleToolHandlers.ListGscPagesByClicksAsync);
    }

    public static IEnumerable<IToolHandler> LinksModule()
    {
        yield return new DelegatingToolHandler("list_orphan_pages", LinksToolHandlers.ListOrphanPagesAsync);
        yield return new DelegatingToolHandler("get_top_linked_pages", LinksToolHandlers.GetTopLinkedPagesAsync);
        yield return new DelegatingToolHandler("get_outbound_link_domains", LinksToolHandlers.GetOutboundLinkDomainsAsync);
        yield return new DelegatingToolHandler("get_link_graph_summary", LinksToolHandlers.GetLinkGraphSummaryAsync);
        yield return new DelegatingToolHandler("get_url_fingerprints", LinksToolHandlers.GetUrlFingerprintsAsync);
        yield return new DelegatingToolHandler("list_broken_link_sources", LinksToolHandlers.ListBrokenLinkSourcesAsync);
        yield return new DelegatingToolHandler("get_link_rel_summary", LinksToolHandlers.GetLinkRelSummaryAsync);
        yield return new DelegatingToolHandler("get_inlink_anchors", LinksToolHandlers.GetInlinkAnchorsAsync);
        yield return new DelegatingToolHandler("list_nofollow_internal_links", LinksToolHandlers.ListNofollowInternalLinksAsync);
    }

    public static IEnumerable<IToolHandler> SecurityModule()
    {
        yield return new DelegatingToolHandler("get_security_findings", SecurityToolHandlers.GetSecurityFindingsAsync);
        yield return new DelegatingToolHandler("get_security_findings_summary", SecurityToolHandlers.GetSecurityFindingsSummaryAsync);
        yield return new DelegatingToolHandler("list_security_findings_by_type", SecurityToolHandlers.ListSecurityFindingsByTypeAsync);
    }

    public static IEnumerable<IToolHandler> SchemaModule()
    {
        yield return new DelegatingToolHandler("get_schema_coverage", SchemaToolHandlers.GetSchemaCoverageAsync);
        yield return new DelegatingToolHandler("list_pages_without_schema", SchemaToolHandlers.ListPagesWithoutSchemaAsync);
        yield return new DelegatingToolHandler("search_pages_by_schema_type", SchemaToolHandlers.SearchPagesBySchemaTypeAsync);
        yield return new DelegatingToolHandler("get_seo_health", SchemaToolHandlers.GetSeoHealthAsync);
        yield return new DelegatingToolHandler("list_schema_errors_by_type", SchemaToolHandlers.ListSchemaErrorsByTypeAsync);
    }

    public static IEnumerable<IToolHandler> ExportModule(IServiceProvider serviceProvider)
    {
        yield return new DelegatingToolHandler("list_export_formats", ExportToolHandlers.ListExportFormatsAsync);
        yield return new DelegatingToolHandler("export_sitemap_xml", ExportToolHandlers.ExportSitemapXmlAsync);
        yield return new DelegatingToolHandler("export_compare_csv", ExportToolHandlers.ExportCompareCsvAsync);
        yield return new InjectingToolHandler(
            "export_list_as_csv",
            (sp, conn, ctx, args, ct) => ExportToolHandlers.ExportListAsCsvAsync(ctx, args, sp.GetRequiredService<ToolDispatcher>(), ct),
            serviceProvider);
        yield return new InjectingToolHandler(
            "export_audit_report",
            (sp, conn, ctx, args, ct) => ExportToolHandlers.ExportAuditReportAsync(conn, ctx, args, sp.GetRequiredService<DataServiceClient>(), ct),
            serviceProvider);
    }

    public static IEnumerable<IToolHandler> IndexationModule()
    {
        yield return new DelegatingToolHandler("get_indexation_coverage", IndexationToolHandlers.GetIndexationCoverageAsync);
        yield return new DelegatingToolHandler("list_indexation_gaps", IndexationToolHandlers.ListIndexationGapsAsync);
        yield return new DelegatingToolHandler("get_indexation_url_join", IndexationToolHandlers.GetIndexationUrlJoinAsync);
    }

    public static IEnumerable<IToolHandler> BacklinksModule()
    {
        yield return new DelegatingToolHandler("get_gsc_links_summary", BacklinksToolHandlers.GetGscLinksSummaryAsync);
        yield return new DelegatingToolHandler("get_gsc_links_import_status", BacklinksToolHandlers.GetGscLinksImportStatusAsync);
        yield return new DelegatingToolHandler("get_competitor_link_gap", BacklinksToolHandlers.GetCompetitorLinkGapAsync);
        yield return new DelegatingToolHandler("get_gsc_sample_links", BacklinksToolHandlers.GetGscSampleLinksAsync);
        yield return new DelegatingToolHandler("get_gsc_latest_links", BacklinksToolHandlers.GetGscLatestLinksAsync);
        yield return new DelegatingToolHandler("get_third_party_links_overlay", BacklinksToolHandlers.GetThirdPartyLinksOverlayAsync);
        yield return new DelegatingToolHandler("get_backlinks_velocity", BacklinksToolHandlers.GetBacklinksVelocityAsync);
    }

    public static IEnumerable<IToolHandler> PerformanceModule()
    {
        yield return new DelegatingToolHandler("get_lighthouse_summary", PerformanceToolHandlers.GetLighthouseSummaryAsync);
        yield return new DelegatingToolHandler("get_lighthouse_for_url", PerformanceToolHandlers.GetLighthouseForUrlAsync);
        yield return new DelegatingToolHandler("get_lighthouse_diagnostics", PerformanceToolHandlers.GetLighthouseDiagnosticsAsync);
        yield return new DelegatingToolHandler("list_slow_pages", PerformanceToolHandlers.ListSlowPagesAsync);
        yield return new DelegatingToolHandler("get_lighthouse_human_summary", PerformanceToolHandlers.GetLighthouseHumanSummaryAsync);
        yield return new DelegatingToolHandler("list_lighthouse_poor_seo_pages", PerformanceToolHandlers.ListLighthousePoorSeoPagesAsync);
        yield return new DelegatingToolHandler("list_lighthouse_cwv_failures", PerformanceToolHandlers.ListLighthouseCwvFailuresAsync);
    }

    public static IEnumerable<IToolHandler> GeoModule(IServiceProvider serviceProvider)
    {
        static HttpClient CreateHttp(IServiceProvider sp) =>
            sp.GetRequiredService<IHttpClientFactory>().CreateClient("GeoAudit");

        yield return new DelegatingToolHandler("get_faq_schema_coverage", GeoToolHandlers.GetFaqSchemaCoverageAsync);
        yield return new DelegatingToolHandler("list_pages_missing_faq_schema", GeoToolHandlers.ListPagesMissingFaqSchemaAsync);
        yield return new DelegatingToolHandler("get_aeo_content_signals_for_url", GeoToolHandlers.GetAeoContentSignalsForUrlAsync);
        yield return new DelegatingToolHandler("get_eeat_signals_summary", GeoToolHandlers.GetEeatSignalsSummaryAsync);
        yield return new DelegatingToolHandler("get_js_rendering_delta", GeoToolHandlers.GetJsRenderingDeltaAsync);
        yield return new DelegatingToolHandler("get_internal_link_suggestions", GeoToolHandlers.GetInternalLinkSuggestionsAsync);
        yield return new InjectingToolHandler(
            "get_llms_txt_status",
            (sp, db, ctx, args, ct) => GeoToolHandlers.GetLlmsTxtStatusAsync(CreateHttp(sp), db, ctx, args, ct),
            serviceProvider);
        yield return new InjectingToolHandler(
            "get_ai_discovery_status",
            (sp, db, ctx, args, ct) => GeoToolHandlers.GetAiDiscoveryStatusAsync(CreateHttp(sp), db, ctx, args, ct),
            serviceProvider);
        yield return new InjectingToolHandler(
            "get_geo_readiness_score",
            (sp, db, ctx, args, ct) => GeoToolHandlers.GetGeoReadinessScoreAsync(CreateHttp(sp), db, ctx, args, ct),
            serviceProvider);
        yield return new InjectingToolHandler(
            "compare_geo_score_deltas",
            (sp, db, ctx, args, ct) => GeoToolHandlers.CompareGeoScoreDeltasAsync(CreateHttp(sp), db, ctx, args, ct),
            serviceProvider);

        yield return new DelegatingToolHandler("get_negative_signals", GeoDetectorsToolHandlers.GetNegativeSignalsAsync);
        yield return new DelegatingToolHandler("detect_prompt_injection", GeoDetectorsToolHandlers.DetectPromptInjectionAsync);
        yield return new DelegatingToolHandler("get_rag_chunk_readiness", GeoDetectorsToolHandlers.GetRagChunkReadinessAsync);
        yield return new DelegatingToolHandler("get_content_decay_signals", GeoDetectorsToolHandlers.GetContentDecaySignalsAsync);
        yield return new DelegatingToolHandler("get_multimodal_readiness", GeoDetectorsToolHandlers.GetMultimodalReadinessAsync);
        yield return new DelegatingToolHandler("get_topic_authority", GeoDetectorsToolHandlers.GetTopicAuthorityAsync);

        yield return new DelegatingToolHandler("get_citability_score", GeoCitabilityToolHandlers.GetCitabilityScoreAsync);
        yield return new DelegatingToolHandler("get_citability_for_url", GeoCitabilityToolHandlers.GetCitabilityForUrlAsync);

        yield return new DelegatingToolHandler("list_pages_missing_howto_schema", GeoListToolHandlers.ListPagesMissingHowtoSchemaAsync);
        yield return new DelegatingToolHandler("list_pages_ai_citation_signals", GeoListToolHandlers.ListPagesAiCitationSignalsAsync);
        yield return new InjectingToolHandler(
            "get_robots_ai_access_score",
            (sp, db, ctx, args, ct) => GeoListToolHandlers.GetRobotsAiAccessScoreAsync(CreateHttp(sp), db, ctx, args, ct),
            serviceProvider);
        yield return new InjectingToolHandler(
            "list_pages_missing_llms_txt_reference",
            (sp, db, ctx, args, ct) => GeoListToolHandlers.ListPagesMissingLlmsTxtReferenceAsync(CreateHttp(sp), db, ctx, args, ct),
            serviceProvider);
        yield return new InjectingToolHandler(
            "list_robots_blocked_ai_crawlers",
            (sp, db, ctx, args, ct) => GeoListToolHandlers.ListRobotsBlockedAiCrawlersAsync(CreateHttp(sp), db, ctx, args, ct),
            serviceProvider);
    }

    public static IEnumerable<IToolHandler> PayloadExtrasModule()
    {
        yield return new DelegatingToolHandler("get_rich_results_summary", PayloadExtrasToolHandlers.GetRichResultsSummaryAsync);
        yield return new DelegatingToolHandler("list_rich_results_failures", PayloadExtrasToolHandlers.ListRichResultsFailuresAsync);
        yield return new DelegatingToolHandler("get_competitor_keyword_gap", PayloadExtrasToolHandlers.GetCompetitorKeywordGapAsync);
        yield return new DelegatingToolHandler("get_site_anchor_text_summary", PayloadExtrasToolHandlers.GetSiteAnchorTextSummaryAsync);
        yield return new DelegatingToolHandler("get_pagination_audit_summary", PayloadExtrasToolHandlers.GetPaginationAuditSummaryAsync);
    }

    public static IEnumerable<IToolHandler> IntegrationsModule(IServiceProvider serviceProvider)
    {
        yield return new InjectingToolHandler(
            "check_ai_citations_live",
            async (sp, conn, ctx, args, ct) =>
            {
                await using var scope = sp.CreateAsyncScope();
                var citations = scope.ServiceProvider.GetRequiredService<CitationCheckService>();
                return await IntegrationToolHandlers.CheckAiCitationsLiveAsync(conn, ctx, args, citations, ct);
            },
            serviceProvider);
    }
}
