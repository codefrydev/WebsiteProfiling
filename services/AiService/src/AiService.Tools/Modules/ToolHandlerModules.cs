using AiService.Tools.Services.Citations;
using AiService.Tools.Handlers.Backlinks;
using AiService.Tools.Handlers.Core;
using AiService.Tools.Handlers.Geo;
using AiService.Tools.Handlers.Google;
using AiService.Tools.Handlers.Indexation;
using AiService.Tools.Handlers.Insight;
using AiService.Tools.Handlers.Integrations;
using AiService.Tools.Handlers.Issues;
using AiService.Tools.Handlers.Links;
using AiService.Tools.Handlers.Performance;
using AiService.Tools.Handlers.Portfolio;
using AiService.Tools.Handlers.Report;
using AiService.Tools.Handlers.Schema;
using AiService.Tools.Handlers.Security;
using AiService.Tools.Handlers.Slice;
using AiService.Tools.Registry;
using Microsoft.Extensions.DependencyInjection;

namespace AiService.Tools.Modules;

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

        foreach (var handler in PayloadExtrasModule())
        {
            yield return handler;
        }
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
