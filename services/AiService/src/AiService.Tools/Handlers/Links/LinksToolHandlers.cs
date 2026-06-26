using System.Text.Json.Nodes;
using AiService.Tools.Context;
using AiService.Tools.Slice;
using WebsiteProfiling.Contracts.Json;

using AiService.Tools.Persistence;
namespace AiService.Tools.Handlers.Links;

/// <summary>Internal linking tools — ports Python <c>links/links.py</c>.</summary>
public static class LinksToolHandlers
{
    public static Task<JsonObject> ListOrphanPagesAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        return CapOrphansAsync(db, ctx, args, cancellationToken);
    }

    public static Task<JsonObject> GetTopLinkedPagesAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
        => PayloadArrayHelpers.CapPayloadArrayAsync(db, ctx, args, "top_pages", "pages", 30, 50, cancellationToken);

    public static Task<JsonObject> GetOutboundLinkDomainsAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
        => PayloadArrayHelpers.CapPayloadArrayAsync(db, ctx, args, "outbound_link_domains", "domains", 30, 50, cancellationToken);

    public static async Task<JsonObject> GetLinkGraphSummaryAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var payload = await scoped.LoadPayloadAsync(db, cancellationToken);
        if (payload.Count == 0)
        {
            return new JsonObject { ["error"] = "no report found" };
        }

        var nodes = payload["graph_nodes"] as JsonArray ?? [];
        var edges = payload["graph_edges"] as JsonArray ?? [];
        var topPages = payload["top_pages"] as JsonArray ?? [];
        var hubs = new JsonArray();
        foreach (var node in topPages.Take(10))
        {
            if (node is JsonObject page)
            {
                hubs.Add(new JsonObject
                {
                    ["url"] = page["url"]?.DeepClone(),
                    ["inlinks"] = page["inlinks"]?.DeepClone(),
                });
            }
        }

        return new JsonObject
        {
            ["node_count"] = nodes.Count,
            ["edge_count"] = edges.Count,
            ["top_hubs"] = hubs,
        };
    }

    public static Task<JsonObject> GetUrlFingerprintsAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
        => PayloadArrayHelpers.CapPayloadArrayAsync(db, ctx, args, "url_fingerprints", "fingerprints", 30, 50, cancellationToken);

    public static async Task<JsonObject> ListBrokenLinkSourcesAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var payload = await scoped.LoadPayloadAsync(db, cancellationToken);
        if (payload.Count == 0)
        {
            return PayloadArrayHelpers.MissingList("sources");
        }

        var brokenUrls = new HashSet<string>(StringComparer.Ordinal);
        if (payload["issues"] is JsonObject issues && issues["broken"] is JsonArray broken)
        {
            foreach (var node in broken)
            {
                if (node is JsonObject item)
                {
                    var url = JsonCoercion.AsString(item["url"])?.Trim();
                    if (!string.IsNullOrEmpty(url))
                    {
                        brokenUrls.Add(url);
                    }
                }
            }
        }

        if (brokenUrls.Count == 0)
        {
            return new JsonObject
            {
                ["sources"] = new JsonArray(),
                ["total"] = 0,
                ["truncated"] = false,
            };
        }

        var sourceMap = new Dictionary<string, HashSet<string>>(StringComparer.Ordinal);
        if (payload["graph_edges"] is JsonArray edges)
        {
            foreach (var node in edges)
            {
                string? src = null;
                string? tgt = null;
                if (node is JsonObject edge)
                {
                    src = JsonCoercion.AsString(edge["from"]) ?? JsonCoercion.AsString(edge["source"]);
                    tgt = JsonCoercion.AsString(edge["to"]) ?? JsonCoercion.AsString(edge["target"]);
                }
                else if (node is JsonArray tuple && tuple.Count >= 2)
                {
                    src = JsonCoercion.AsString(tuple[0]);
                    tgt = JsonCoercion.AsString(tuple[1]);
                }

                if (string.IsNullOrWhiteSpace(src) || string.IsNullOrWhiteSpace(tgt) || !brokenUrls.Contains(tgt))
                {
                    continue;
                }

                if (!sourceMap.TryGetValue(tgt, out var set))
                {
                    set = new HashSet<string>(StringComparer.Ordinal);
                    sourceMap[tgt] = set;
                }

                set.Add(src.Trim());
            }
        }

        var items = sourceMap
            .Select(kvp =>
            {
                var srcs = kvp.Value.OrderBy(x => x, StringComparer.Ordinal).ToList();
                return new JsonObject
                {
                    ["broken_url"] = kvp.Key,
                    ["source_count"] = srcs.Count,
                    ["source_urls"] = new JsonArray(srcs.Take(10).Select(u => JsonValue.Create(u)).ToArray()),
                };
            })
            .OrderByDescending(o => o["source_count"]?.GetValue<int?>() ?? 0)
            .Cast<JsonNode?>()
            .ToList();

        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 30, 50);
        var sliced = PayloadSliceHelpers.CapList(items, limit, 50);
        return new JsonObject
        {
            ["sources"] = sliced["items"]?.DeepClone(),
            ["total"] = sliced["total"]?.DeepClone(),
            ["truncated"] = sliced["truncated"]?.DeepClone(),
        };
    }

    public static async Task<JsonObject> GetLinkRelSummaryAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var payload = await scoped.LoadPayloadAsync(db, cancellationToken);
        if (payload.Count == 0)
        {
            return new JsonObject { ["error"] = "no report found" };
        }

        if (payload["link_rel_summary"] is JsonObject summary)
        {
            return summary.DeepClone() as JsonObject ?? [];
        }

        return LinkSliceHelpers.SummarizeLinkRel(payload["link_edges"] as JsonArray);
    }

    public static async Task<JsonObject> GetInlinkAnchorsAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var target = (JsonCoercion.AsString(args["url"]) ?? JsonCoercion.AsString(args["target_url"]) ?? "")
            .Trim().TrimEnd('/').ToLowerInvariant();
        return await PayloadArrayHelpers.CapPayloadArrayAsync(
            db,
            ctx,
            args,
            "inlink_anchor_matrix",
            "rows",
            50,
            200,
            cancellationToken,
            filter: node =>
            {
                if (string.IsNullOrEmpty(target))
                {
                    return true;
                }

                return node is JsonObject row
                    && (JsonCoercion.AsString(row["target_url"]) ?? "").TrimEnd('/').ToLowerInvariant() == target;
            });
    }

    public static Task<JsonObject> ListNofollowInternalLinksAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
        => PayloadArrayHelpers.CapPayloadArrayAsync(
            db,
            ctx,
            args,
            "link_edges",
            "links",
            50,
            100,
            cancellationToken,
            filter: node => node is JsonObject edge
                && string.Equals(JsonCoercion.AsString(edge["link_type"]), "internal", StringComparison.Ordinal)
                && (edge["is_nofollow"]?.GetValue<bool?>() == true
                    || string.Equals(JsonCoercion.AsString(edge["is_nofollow"]), "true", StringComparison.OrdinalIgnoreCase)));

    private static async Task<JsonObject> CapOrphansAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var payload = await scoped.LoadPayloadAsync(db, cancellationToken);
        if (payload.Count == 0)
        {
            return PayloadArrayHelpers.MissingList("orphans");
        }

        var orphans = payload["orphan_urls"] as JsonArray ?? [];
        var items = orphans
            .Select(o => JsonCoercion.AsString(o))
            .Where(u => !string.IsNullOrWhiteSpace(u))
            .Select(u => (JsonNode?)new JsonObject { ["url"] = u })
            .ToList();
        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 50, 50);
        var sliced = PayloadSliceHelpers.CapList(items, limit);
        return new JsonObject
        {
            ["orphans"] = sliced["items"]?.DeepClone(),
            ["total"] = sliced["total"]?.DeepClone(),
            ["truncated"] = sliced["truncated"]?.DeepClone(),
        };
    }
}
