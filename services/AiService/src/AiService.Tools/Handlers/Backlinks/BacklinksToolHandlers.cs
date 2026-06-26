using System.Text.Json;
using System.Text.Json.Nodes;
using AiService.Tools.Context;
using AiService.Tools.Slice;
using AiService.Tools.Persistence;
using Microsoft.EntityFrameworkCore;
using WebsiteProfiling.Contracts.Json;

namespace AiService.Tools.Handlers.Backlinks;

/// <summary>Backlinks and GSC links tools — ports Python <c>backlinks/backlinks.py</c>.</summary>
public static class BacklinksToolHandlers
{
    public static async Task<JsonObject> GetGscLinksSummaryAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        if (scoped.PropertyId is not int propertyId)
        {
            return new JsonObject { ["error"] = "property_id is required for GSC links data" };
        }

        var data = await scoped.LoadGscLinksAsync(db, cancellationToken);
        if (data is null)
        {
            return new JsonObject
            {
                ["error"] = "no GSC links data — import GSC Links CSV in Integrations",
                ["missing"] = true,
            };
        }

        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 20, 50);
        var topSites = PayloadSliceHelpers.CapList((data["top_linking_sites"] as JsonArray ?? []).ToList(), limit, 50);
        var topPages = PayloadSliceHelpers.CapList((data["top_linked_pages"] as JsonArray ?? []).ToList(), limit, 50);
        return new JsonObject
        {
            ["imported_at"] = data["imported_at"]?.DeepClone(),
            ["export_types"] = data["export_types"]?.DeepClone() ?? new JsonArray(),
            ["row_counts"] = data["row_counts"]?.DeepClone() ?? new JsonObject(),
            ["top_linking_sites"] = topSites["items"]?.DeepClone(),
            ["top_linked_pages"] = topPages["items"]?.DeepClone(),
            ["sample_links_full_count"] = data["sample_links_full_count"]?.DeepClone(),
            ["latest_links_full_count"] = data["latest_links_full_count"]?.DeepClone(),
            ["property_id"] = propertyId,
        };
    }

    public static async Task<JsonObject> GetGscLinksImportStatusAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        if (scoped.PropertyId is not int propertyId)
        {
            return new JsonObject { ["error"] = "property_id is required" };
        }

        var data = await scoped.LoadGscLinksAsync(db, cancellationToken);
        if (data is null)
        {
            return new JsonObject { ["hasData"] = false };
        }

        return new JsonObject
        {
            ["hasData"] = true,
            ["lastImportedAt"] = data["imported_at"]?.DeepClone(),
            ["exportTypes"] = data["export_types"]?.DeepClone() ?? new JsonArray(),
            ["rowCounts"] = data["row_counts"]?.DeepClone() ?? new JsonObject(),
            ["referringDomainCount"] = (data["top_linking_sites"] as JsonArray ?? []).Count,
            ["topLinkedPageCount"] = (data["top_linked_pages"] as JsonArray ?? []).Count,
            ["sampleLinkCount"] = (data["sample_links"] as JsonArray ?? []).Count,
            ["latestLinkCount"] = (data["latest_links"] as JsonArray ?? []).Count,
        };
    }

    public static async Task<JsonObject> GetCompetitorLinkGapAsync(
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

        if (payload["competitor_link_gap"] is not JsonObject gap)
        {
            return new JsonObject
            {
                ["error"] = "competitor_link_gap not in report — configure competitor_domains and import GSC links",
                ["missing"] = true,
            };
        }

        return new JsonObject { ["competitor_link_gap"] = gap.DeepClone() };
    }

    public static async Task<JsonObject> GetGscSampleLinksAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
        => await CapGscLinksAsync(db, ctx, args, "sample_links", "sample_links_full_count", cancellationToken);

    public static async Task<JsonObject> GetGscLatestLinksAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
        => await CapGscLinksAsync(db, ctx, args, "latest_links", "latest_links_full_count", cancellationToken);

    public static async Task<JsonObject> GetThirdPartyLinksOverlayAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        if (scoped.PropertyId is not int _)
        {
            return new JsonObject { ["error"] = "property_id is required" };
        }

        var data = await scoped.LoadGscLinksAsync(db, cancellationToken);
        if (data is null)
        {
            return new JsonObject { ["error"] = "no GSC links data", ["missing"] = true, ["overlays"] = new JsonArray() };
        }

        var overlays = data["third_party_overlays"] as JsonArray ?? [];
        var provider = (JsonCoercion.AsString(args["provider"]) ?? "").Trim().ToLowerInvariant();
        if (provider.Length > 0)
        {
            var filtered = new JsonArray();
            foreach (var node in overlays)
            {
                if (node is JsonObject overlay
                    && string.Equals(JsonCoercion.AsString(overlay["provider"]), provider, StringComparison.OrdinalIgnoreCase))
                {
                    filtered.Add(node.DeepClone());
                }
            }

            overlays = filtered;
        }

        return new JsonObject { ["overlays"] = overlays.DeepClone(), ["count"] = overlays.Count };
    }

    public static async Task<JsonObject> GetBacklinksVelocityAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        if (scoped.PropertyId is not int propertyId)
        {
            return new JsonObject { ["error"] = "property_id is required" };
        }

        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 52, 52);
        var rows = await db.GscLinksSnapshots.AsNoTracking()
            .Where(x => x.PropertyId == propertyId)
            .OrderBy(x => x.FetchedAt)
            .Take(limit)
            .ToListAsync(cancellationToken);

        var snapshots = new JsonArray();
        foreach (var row in rows)
        {
            JsonNode? topDomains = null;
            try
            {
                topDomains = JsonNode.Parse(row.TopDomains);
            }
            catch (JsonException) { }

            snapshots.Add(new JsonObject
            {
                ["captured_at"] = row.FetchedAt.ToString("O"),
                ["referring_domains"] = row.ReferringDomains,
                ["top_domains"] = topDomains?.DeepClone(),
            });
        }

        return new JsonObject
        {
            ["snapshots"] = snapshots,
            ["count"] = snapshots.Count,
            ["property_id"] = propertyId,
        };
    }

    private static async Task<JsonObject> CapGscLinksAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        string linksKey,
        string fullCountKey,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        if (scoped.PropertyId is not int _)
        {
            return new JsonObject { ["error"] = "property_id is required" };
        }

        var data = await scoped.LoadGscLinksAsync(db, cancellationToken);
        if (data is null)
        {
            return new JsonObject
            {
                ["error"] = "no GSC links data",
                ["missing"] = true,
                ["links"] = new JsonArray(),
                ["total"] = 0,
                ["truncated"] = false,
            };
        }

        var links = data[linksKey] as JsonArray ?? [];
        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 30, 100);
        var sliced = PayloadSliceHelpers.CapList(links.ToList(), limit, 100);
        return new JsonObject
        {
            ["links"] = sliced["items"]?.DeepClone(),
            ["total"] = data[fullCountKey]?.DeepClone() ?? sliced["total"]?.DeepClone(),
            ["truncated"] = sliced["truncated"]?.DeepClone(),
            ["full_count"] = data[fullCountKey]?.DeepClone(),
        };
    }
}
