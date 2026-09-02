using System.Text.Json.Nodes;
using AiService.Api.Tools.Domain;
using AiService.Api.Tools.Registry;
using AiService.Api.Tools.Selection;

namespace AiService.Api.Mcp;

/// <summary>
/// Presents the audit tool catalog for <c>GET /api/mcp-tools</c> (mirrors Python MCP router).
/// </summary>
public sealed class McpToolCatalogService(ToolCatalog catalog, AuditToolSelectionService selection)
{
    private readonly ToolCatalogEntryLookup _lookup = new(catalog);

    public async Task<JsonObject> ListToolsAsync(CancellationToken cancellationToken = default)
    {
        var snapshot = await selection.GetSnapshotAsync(cancellationToken);
        var allNames = catalog.ToolNames.ToList();
        var bundleSets = McpToolDomains.McpDomainBundles.Keys.ToDictionary(
            bundle => bundle,
            bundle => McpToolDomains.ToolNamesForMcpBundle(allNames, bundle),
            StringComparer.Ordinal);
        bundleSets["custom"] = snapshot.EnabledToolNames.ToHashSet(StringComparer.Ordinal);

        var tools = new JsonArray();
        foreach (var name in allNames.Order(StringComparer.Ordinal))
        {
            if (!_lookup.TryGetEntry(name, out var entry))
            {
                continue;
            }

            var domain = McpToolDomains.ClassifyToolDomain(name);
            var inBundles = bundleSets
                .Where(pair => pair.Value.Contains(name))
                .Select(pair => pair.Key)
                .Order(StringComparer.Ordinal)
                .Select(x => JsonValue.Create(x))
                .ToArray();

            tools.Add(new JsonObject
            {
                ["name"] = name,
                ["description"] = entry.Description,
                ["domain"] = domain,
                ["bundles"] = new JsonArray(inBundles),
                ["enabled"] = snapshot.EnabledToolNames.Contains(name),
            });
        }

        var bundleNames = new JsonArray(
            McpToolDomains.McpDomainBundles.Keys
                .Concat(["custom"])
                .Distinct(StringComparer.Ordinal)
                .Order(StringComparer.Ordinal)
                .Select(x => JsonValue.Create(x))
                .ToArray());

        return new JsonObject
        {
            ["tools"] = tools,
            ["bundles"] = bundleNames,
            ["domains"] = new JsonArray(
                McpToolDomains.CanonicalDomains.Select(d => JsonValue.Create(d)).ToArray()),
            ["current_bundle"] = snapshot.BundleKey,
            ["enabled_domains"] = new JsonArray(snapshot.EnabledDomains.Select(d => JsonValue.Create(d)).ToArray()),
            ["enabled_tool_count"] = snapshot.EnabledToolNames.Count,
        };
    }
}
