using AiService.Domain.Models;
using AiService.Tools.Domain;
using AiService.Tools.Registry;
using AiService.Tools.Selection;

namespace AiService.Tests;

public sealed class AuditToolSelectionTests
{
    private static readonly HashSet<string> SampleNames =
    [
        "get_report_summary",
        "list_issues",
        "get_opportunity_matrix",
        "get_gsc_daily_trend",
        "list_broken_links",
        "prepare_audit_run",
    ];

    [Fact]
    public void Core_bundle_includes_tier0_and_insight()
    {
        var names = McpToolDomains.ToolNamesForMcpBundle(SampleNames, "core");
        Assert.Contains("get_report_summary", names);
        Assert.Contains("get_opportunity_matrix", names);
        Assert.DoesNotContain("get_gsc_daily_trend", names);
        Assert.DoesNotContain("prepare_audit_run", names);
    }

    [Fact]
    public void Custom_domains_only_include_selected_groups()
    {
        var names = McpToolDomains.ToolNamesForEnabledDomains(SampleNames, ["google", "links"]);
        Assert.Contains("get_gsc_daily_trend", names);
        Assert.Contains("list_broken_links", names);
        Assert.DoesNotContain("get_opportunity_matrix", names);
    }

    [Fact]
    public void Disabled_tools_are_removed_from_snapshot()
    {
        var mcp = new McpSettings
        {
            ToolBundle = "full",
            DisabledTools = """["list_issues"]""",
        };

        var bundle = AuditToolSelectionService.ResolveBundleKey(mcp);
        Assert.Equal("full", bundle);

        var disabled = AuditToolSelectionService.ParseDisabledTools(mcp.DisabledTools);
        Assert.Contains("list_issues", disabled);
    }

    [Fact]
    public void Chat_selector_caps_tools_and_keeps_tier0()
    {
        var catalog = new ToolCatalog();
        var allowed = catalog.ToolNames.ToHashSet(StringComparer.Ordinal);
        var selected = ChatToolSelector.SelectToolsForTurn(
            "show me broken links on the site",
            null,
            allowed);

        Assert.True(selected.Count <= ChatToolSelector.ResolveChatToolMax());
        Assert.Contains("search_audit_tools", selected);
        Assert.Contains("get_report_summary", selected);
    }
}
