using System.ComponentModel;
using System.Text.Json;
using System.Text.Json.Nodes;
using AiService.Tools.Context;
using AiService.Tools.Domain;
using AiService.Tools.Registry;
using AiService.Tools.Selection;
using ModelContextProtocol.Server;

namespace AiService.Mcp;

/// <summary>
/// MCP audit tools that delegate to <see cref="ToolDispatcher"/>.
/// Exposes catalog tools filtered by pipeline bundle, custom domains, and disabled-tool list.
/// </summary>
[McpServerToolType]
public sealed class McpAuditTools
{
    private readonly ToolDispatcher _dispatcher;
    private readonly AuditToolSelectionService _selection;
    private readonly ToolCatalogEntryLookup _entryLookup;

    public McpAuditTools(
        ToolDispatcher dispatcher,
        AuditToolSelectionService selection,
        ToolCatalogEntryLookup entryLookup)
    {
        _dispatcher = dispatcher;
        _selection = selection;
        _entryLookup = entryLookup;
    }

    [McpServerTool(Name = "list_audit_tools")]
    [Description("List Site Audit tools exposed for the current tool bundle, including tool_count.")]
    public async Task<string> ListAuditTools(CancellationToken cancellationToken = default)
    {
        var snapshot = await _selection.GetSnapshotAsync(cancellationToken);
        var payload = McpToolDomains.BuildListToolsPayload(
            snapshot.EnabledToolNames,
            _entryLookup,
            snapshot.BundleKey);
        payload["enabled_domains"] = new JsonArray(
            snapshot.EnabledDomains.Select(d => JsonValue.Create(d)).ToArray());
        return payload.ToJsonString(new JsonSerializerOptions { WriteIndented = true });
    }

    [McpServerTool(Name = "call_audit_tool")]
    [Description("Invoke a Site Audit tool by name. Arguments are passed as a JSON object string.")]
    public async Task<string> CallAuditTool(
        [Description("Audit tool name from list_audit_tools.")] string name,
        [Description("Tool arguments as a JSON object string.")] string? arguments = null,
        [Description("Site property id. Falls back to WP_PROPERTY_ID when omitted.")] int? property_id = null,
        [Description("Optional report id.")] int? report_id = null,
        CancellationToken cancellationToken = default)
        => await DispatchNamedToolAsync(name, arguments, property_id, report_id, cancellationToken);

    internal async Task<string> DispatchNamedToolAsync(
        string name,
        string? arguments,
        int? propertyId,
        int? reportId,
        CancellationToken cancellationToken)
    {
        var snapshot = await _selection.GetSnapshotAsync(cancellationToken);
        if (!snapshot.EnabledToolNames.Contains(name))
        {
            var error = new JsonObject
            {
                ["error"] = $"tool not exposed in bundle {snapshot.BundleKey}: {name}",
                ["hint"] = "Adjust mcp_domain / mcp_enabled_domains in Risk Settings or set WP_MCP_DOMAIN=full.",
                ["enabled_domains"] = new JsonArray(snapshot.EnabledDomains.Select(d => JsonValue.Create(d)).ToArray()),
            };
            return error.ToJsonString(new JsonSerializerOptions { WriteIndented = true });
        }

        var args = ParseArguments(arguments);
        MergeContext(args, propertyId, reportId);
        var ctx = BuildContext(args);
        var result = await _dispatcher.DispatchAsync(name, ctx, args, cancellationToken);
        return result.ToJsonString(new JsonSerializerOptions { WriteIndented = true });
    }

    private static JsonObject ParseArguments(string? arguments)
    {
        if (string.IsNullOrWhiteSpace(arguments))
        {
            return [];
        }

        try
        {
            return JsonNode.Parse(arguments) as JsonObject ?? [];
        }
        catch (JsonException ex)
        {
            return new JsonObject { ["error"] = $"invalid arguments JSON: {ex.Message}" };
        }
    }

    private static void MergeContext(JsonObject args, int? propertyId, int? reportId)
    {
        if (propertyId is int pid && !args.ContainsKey("property_id"))
        {
            args["property_id"] = pid;
        }
        else if (propertyId is null && McpToolDomains.DefaultPropertyId() is int defaultPid && !args.ContainsKey("property_id"))
        {
            args["property_id"] = defaultPid;
        }

        if (reportId is int rid && !args.ContainsKey("report_id"))
        {
            args["report_id"] = rid;
        }
    }

    private static AuditToolContext BuildContext(JsonObject args)
    {
        var ctx = new AuditToolContext
        {
            PropertyId = McpToolDomains.DefaultPropertyId(),
        };
        return ctx.WithArgs(args);
    }
}
