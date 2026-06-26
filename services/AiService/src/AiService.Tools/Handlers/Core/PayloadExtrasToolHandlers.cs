using System.Text.Json.Nodes;
using AiService.Tools.Context;
using AiService.Tools.Slice;
using Npgsql;
using WebsiteProfiling.Contracts.Json;

namespace AiService.Tools.Handlers.Core;

/// <summary>Extra payload slice tools — ports Python <c>core/payload_extras.py</c>.</summary>
public static class PayloadExtrasToolHandlers
{
    public static async Task<JsonObject> GetRichResultsSummaryAsync(
        NpgsqlConnection conn,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var payload = await scoped.LoadPayloadAsync(conn, cancellationToken);
        if (payload.Count == 0)
        {
            return new JsonObject { ["error"] = "no report found", ["missing"] = true };
        }

        if (payload["rich_results_meta"] is not JsonObject meta)
        {
            return new JsonObject
            {
                ["missing"] = true,
                ["meta"] = null,
                ["note"] = "rich_results_meta not in report — enable rich results validation on build",
            };
        }

        return new JsonObject
        {
            ["meta"] = meta.DeepClone(),
            ["missing"] = false,
            ["provenance"] = "Crawl / GSC / API",
        };
    }

    public static async Task<JsonObject> ListRichResultsFailuresAsync(
        NpgsqlConnection conn,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        return await PayloadArrayHelpers.CapPayloadArrayAsync(
            conn,
            ctx,
            args,
            "rich_results_validation",
            "failures",
            30,
            50,
            cancellationToken,
            filter: node => node is JsonObject row
                && !string.Equals(JsonCoercion.AsString(row["status"]), "pass", StringComparison.OrdinalIgnoreCase)
                && !string.Equals(JsonCoercion.AsString(row["status"]), "ok", StringComparison.OrdinalIgnoreCase));
    }

    public static Task<JsonObject> GetCompetitorKeywordGapAsync(
        NpgsqlConnection conn,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
        => CapCompetitorKeywordGapAsync(conn, ctx, args, cancellationToken);

    private static async Task<JsonObject> CapCompetitorKeywordGapAsync(
        NpgsqlConnection conn,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var result = await PayloadArrayHelpers.CapPayloadArrayAsync(
            conn, ctx, args, "competitor_keyword_gap", "rows", 30, 50, cancellationToken);
        result["provenance"] = "Estimated";
        return result;
    }

    public static async Task<JsonObject> GetSiteAnchorTextSummaryAsync(
        NpgsqlConnection conn,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var payload = await scoped.LoadPayloadAsync(conn, cancellationToken);
        if (payload.Count == 0)
        {
            return PayloadArrayHelpers.MissingList("anchors");
        }

        if (payload["inlink_anchor_matrix"] is not JsonArray matrix || matrix.Count == 0)
        {
            return new JsonObject
            {
                ["anchors"] = new JsonArray(),
                ["total"] = 0,
                ["truncated"] = false,
                ["missing"] = true,
                ["note"] = "inlink_anchor_matrix not in report — rebuild with link_edges",
            };
        }

        var counter = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var node in matrix)
        {
            if (node is not JsonObject row)
            {
                continue;
            }

            var anchor = JsonCoercion.AsString(row["anchor_text"])?.Trim();
            if (string.IsNullOrEmpty(anchor))
            {
                anchor = "(empty)";
            }

            var count = row["inlink_count"]?.GetValue<int?>() ?? 0;
            counter[anchor] = counter.GetValueOrDefault(anchor) + count;
        }

        var ranked = counter
            .OrderByDescending(kvp => kvp.Value)
            .Select(kvp => (JsonNode?)new JsonObject { ["anchor_text"] = kvp.Key, ["inlink_count"] = kvp.Value })
            .ToList();
        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 30, 50);
        var sliced = PayloadSliceHelpers.CapList(ranked, limit, 50);
        return new JsonObject
        {
            ["anchors"] = sliced["items"]?.DeepClone(),
            ["total"] = sliced["total"]?.DeepClone(),
            ["truncated"] = sliced["truncated"]?.DeepClone(),
            ["provenance"] = "Crawl",
        };
    }

    public static async Task<JsonObject> GetPaginationAuditSummaryAsync(
        NpgsqlConnection conn,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var rows = await scoped.LoadCrawlDfAsync(conn, cancellationToken);
        if (rows.Count == 0)
        {
            return EmptyPaginationSummary();
        }

        var orphanPrev = 0;
        var ampMismatch = 0;
        var relNext = 0;
        var relPrev = 0;
        foreach (var row in rows)
        {
            var status = JsonCoercion.AsString(row["status"]) ?? "";
            if (!status.StartsWith('2'))
            {
                continue;
            }

            var pag = ParsePagination(row);
            var hasNext = pag["rel_next"]?.GetValue<bool?>() == true;
            var hasPrev = pag["rel_prev"]?.GetValue<bool?>() == true;
            if (hasNext)
            {
                relNext++;
            }

            if (hasPrev)
            {
                relPrev++;
            }

            if (hasPrev && !hasNext)
            {
                orphanPrev++;
            }

            var amphtml = JsonCoercion.AsString(pag["amphtml"]);
            var canon = JsonCoercion.AsString(row["canonical_url"])?.Trim();
            if (!string.IsNullOrEmpty(amphtml) && !string.IsNullOrEmpty(canon) && amphtml != canon)
            {
                ampMismatch++;
            }
        }

        return new JsonObject
        {
            ["orphan_prev_count"] = orphanPrev,
            ["amp_mismatch_count"] = ampMismatch,
            ["pages_with_rel_next"] = relNext,
            ["pages_with_rel_prev"] = relPrev,
            ["provenance"] = "Crawl",
        };
    }

    private static JsonObject EmptyPaginationSummary() => new()
    {
        ["orphan_prev_count"] = 0,
        ["amp_mismatch_count"] = 0,
        ["pages_with_rel_next"] = 0,
        ["pages_with_rel_prev"] = 0,
    };

    private static JsonObject ParsePagination(JsonObject row)
    {
        if (row["pagination"] is JsonObject direct)
        {
            return direct;
        }

        var analysis = CrawlSliceHelpers.ParsePageAnalysis(row);
        if (analysis["pagination"] is JsonObject nested)
        {
            return nested;
        }

        return [];
    }
}
