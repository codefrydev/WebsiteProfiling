using AiService.Application;
using AiService.Application.Handlers;
using AiService.Tools;
using AiService.Tools.Modules;
using Microsoft.Extensions.DependencyInjection;

namespace AiService.Tests;

public sealed class NativeToolHandlerTests
{
    [Fact]
    public void ToolRegistry_registers_tier0_slice_and_llm_tools()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddAiServiceTools();
        var provider = services.BuildServiceProvider();
        var registry = ToolRegistryExtensions.CreateToolRegistry(provider);
        var handlers = registry.RegisteredToolNames;
        Assert.Contains("search_audit_tools", handlers);
        Assert.Contains("get_data_coverage_report", handlers);
        Assert.Contains("get_google_summary", handlers);
        Assert.Contains("check_ai_citations_live", handlers);
        Assert.Contains("get_crux_summary", handlers);
        Assert.Contains("get_gsc_top_queries", handlers);
        Assert.Contains("generate_robots_txt", handlers);
        Assert.Contains("get_category_issues", handlers);
        Assert.Contains("get_portfolio_summary", handlers);
        Assert.Contains("prioritize_fix_roadmap", handlers);
        Assert.Contains("list_orphan_pages", handlers);
        Assert.Contains("get_schema_coverage", handlers);
        Assert.Contains("get_gsc_links_summary", handlers);
        Assert.Contains("get_indexation_coverage", handlers);
    }
}
