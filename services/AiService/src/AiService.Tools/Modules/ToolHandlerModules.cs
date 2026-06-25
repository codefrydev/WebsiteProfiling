using AiService.Tools.Handlers.Insight;
using AiService.Tools.Handlers.Report;
using AiService.Tools.Registry;

namespace AiService.Tools.Modules;

/// <summary>
/// Registers native C# audit tool handlers by domain. Extend one module at a time as tools are ported from Python.
/// </summary>
public static class ToolHandlerModules
{
    public static IEnumerable<IToolHandler> AllHandlers()
    {
        foreach (var handler in CoreModule())
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
    }

    /// <summary>Tier-0 router tools and SQL (when ported).</summary>
    public static IEnumerable<IToolHandler> CoreModule()
        => Array.Empty<IToolHandler>();

    /// <summary>Report overview and portfolio reads.</summary>
    public static IEnumerable<IToolHandler> PortfolioModule()
    {
        yield return new DelegatingToolHandler("get_report_summary", ReportToolHandlers.GetReportSummaryAsync);
    }

    /// <summary>Issues and prioritization (partial port).</summary>
    public static IEnumerable<IToolHandler> IssuesModule()
    {
        yield return new DelegatingToolHandler("list_issues", ReportToolHandlers.ListIssuesAsync);
        yield return new DelegatingToolHandler("get_critical_issues", ReportToolHandlers.GetCriticalIssuesAsync);
    }

    /// <summary>Blended insight and opportunity tools (native GSC/GA4 blending).</summary>
    public static IEnumerable<IToolHandler> InsightModule()
    {
        yield return new DelegatingToolHandler("get_landing_page_blended_table", InsightToolHandlers.GetLandingPageBlendedTableAsync);
        yield return new DelegatingToolHandler("get_opportunity_matrix", InsightToolHandlers.GetOpportunityMatrixAsync);
        yield return new DelegatingToolHandler("get_traffic_health_check", InsightToolHandlers.GetTrafficHealthCheckAsync);
    }
}
