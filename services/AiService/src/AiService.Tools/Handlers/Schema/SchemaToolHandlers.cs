using System.Text.Json.Nodes;
using AiService.Tools.Context;
using AiService.Tools.Slice;
using WebsiteProfiling.Contracts.Json;

using AiService.Tools.Persistence;
namespace AiService.Tools.Handlers.Schema;

/// <summary>Schema markup audit tools — ports Python <c>schema/schema.py</c>.</summary>
public static class SchemaToolHandlers
{
    public static async Task<JsonObject> GetSchemaCoverageAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var rows = await scoped.LoadCrawlDfAsync(db, cancellationToken);
        if (rows.Count == 0)
        {
            return new JsonObject
            {
                ["error"] = "no crawl data",
                ["with_schema"] = 0,
                ["without_schema"] = 0,
                ["total"] = 0,
            };
        }

        var withSchema = 0;
        var typeCounts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        foreach (var row in rows)
        {
            if (CrawlSliceHelpers.RowHasSchema(row))
            {
                withSchema++;
            }

            foreach (var type in CrawlSliceHelpers.RowSchemaTypesList(row))
            {
                typeCounts[type] = typeCounts.GetValueOrDefault(type) + 1;
            }
        }

        var topTypes = new JsonArray(typeCounts
            .OrderByDescending(kvp => kvp.Value)
            .Take(20)
            .Select(kvp => (JsonNode?)new JsonObject { ["type"] = kvp.Key, ["count"] = kvp.Value })
            .ToArray());

        var total = rows.Count;
        return new JsonObject
        {
            ["total_pages"] = total,
            ["with_schema"] = withSchema,
            ["without_schema"] = total - withSchema,
            ["coverage_pct"] = total > 0 ? Math.Round(100.0 * withSchema / total, 1) : 0,
            ["top_schema_types"] = topTypes,
        };
    }

    public static async Task<JsonObject> ListPagesWithoutSchemaAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var rows = await scoped.LoadCrawlDfAsync(db, cancellationToken);
        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 30, 30);
        return CrawlSliceHelpers.CrawlFilter(rows, hasSchema: false, limit: limit, maxCap: 30);
    }

    public static async Task<JsonObject> SearchPagesBySchemaTypeAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var schemaType = JsonCoercion.AsString(args["schema_type"])?.Trim() ?? "";
        if (schemaType.Length == 0)
        {
            return new JsonObject { ["error"] = "schema_type is required" };
        }

        var scoped = ctx.WithArgs(args);
        var rows = await scoped.LoadCrawlDfAsync(db, cancellationToken);
        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 30, 30);
        return CrawlSliceHelpers.CrawlFilter(rows, schemaType: schemaType, limit: limit, maxCap: 30);
    }

    public static async Task<JsonObject> GetSeoHealthAsync(
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

        return PayloadSliceHelpers.PayloadDictSlice(payload, "seo_health");
    }

    public static async Task<JsonObject> ListSchemaErrorsByTypeAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var schemaType = (JsonCoercion.AsString(args["schema_type"]) ?? JsonCoercion.AsString(args["type"]) ?? "")
            .Trim()
            .ToLowerInvariant();

        var result = await PayloadArrayHelpers.CapPayloadArrayAsync(
            db,
            ctx,
            args,
            "rich_results_validation",
            "errors",
            30,
            50,
            cancellationToken,
            filter: node =>
            {
                if (node is not JsonObject error)
                {
                    return false;
                }

                var status = (JsonCoercion.AsString(error["status"]) ?? "").ToLowerInvariant();
                if (status == "pass")
                {
                    return false;
                }

                if (schemaType.Length == 0)
                {
                    return true;
                }

                var typeValue = (JsonCoercion.AsString(error["type"]) ?? JsonCoercion.AsString(error["schema_type"]) ?? "")
                    .ToLowerInvariant();
                return typeValue.Contains(schemaType, StringComparison.Ordinal);
            });

        return result;
    }
}
