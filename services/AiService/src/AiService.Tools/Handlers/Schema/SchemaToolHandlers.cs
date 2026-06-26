using System.Text.Json.Nodes;
using AiService.Tools.Context;
using AiService.Tools.Slice;
using Npgsql;
using WebsiteProfiling.Contracts.Json;

namespace AiService.Tools.Handlers.Schema;

/// <summary>Schema markup audit tools — ports Python <c>schema/schema.py</c>.</summary>
public static class SchemaToolHandlers
{
    public static async Task<JsonObject> GetSchemaCoverageAsync(
        NpgsqlConnection conn,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var rows = await scoped.LoadCrawlDfAsync(conn, cancellationToken);
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
        NpgsqlConnection conn,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var rows = await scoped.LoadCrawlDfAsync(conn, cancellationToken);
        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 30, 30);
        return CrawlSliceHelpers.CrawlFilter(rows, hasSchema: false, limit: limit, maxCap: 30);
    }

    public static async Task<JsonObject> SearchPagesBySchemaTypeAsync(
        NpgsqlConnection conn,
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
        var rows = await scoped.LoadCrawlDfAsync(conn, cancellationToken);
        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 30, 30);
        return CrawlSliceHelpers.CrawlFilter(rows, schemaType: schemaType, limit: limit, maxCap: 30);
    }
}
