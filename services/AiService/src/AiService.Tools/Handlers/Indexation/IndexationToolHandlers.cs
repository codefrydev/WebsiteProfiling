using System.Text.Json.Nodes;
using AiService.Tools.Context;
using AiService.Tools.Slice;
using WebsiteProfiling.Contracts.Json;

using AiService.Tools.Persistence;
namespace AiService.Tools.Handlers.Indexation;

/// <summary>Indexation coverage tools — ports Python <c>indexation/indexation_tools.py</c>.</summary>
public static class IndexationToolHandlers
{
    private static readonly HashSet<string> GapTypes = new(StringComparer.Ordinal)
    {
        "sitemap_only",
        "crawled_not_in_sitemap",
        "gsc_not_crawled",
    };

    public static async Task<JsonObject> GetIndexationCoverageAsync(
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

        if (payload["indexation_coverage"] is not JsonObject cov)
        {
            return new JsonObject
            {
                ["error"] = "indexation_coverage not in report — run audit with GSC connected",
                ["missing"] = true,
            };
        }

        return new JsonObject { ["indexation_coverage"] = cov.DeepClone() };
    }

    public static async Task<JsonObject> ListIndexationGapsAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var payload = await scoped.LoadPayloadAsync(db, cancellationToken);
        if (payload.Count == 0)
        {
            return PayloadArrayHelpers.MissingList("urls");
        }

        if (payload["indexation_coverage"] is not JsonObject cov)
        {
            return new JsonObject
            {
                ["error"] = "indexation_coverage not in report",
                ["missing"] = true,
                ["urls"] = new JsonArray(),
                ["total"] = 0,
                ["truncated"] = false,
            };
        }

        var gapType = JsonCoercion.AsString(args["gap_type"])?.Trim() ?? "";
        if (!GapTypes.Contains(gapType))
        {
            return new JsonObject
            {
                ["error"] = $"gap_type must be one of: {string.Join(", ", GapTypes.OrderBy(x => x))}",
                ["urls"] = new JsonArray(),
                ["total"] = 0,
                ["truncated"] = false,
            };
        }

        JsonArray urls = [];
        if (cov["lists"] is JsonObject lists && lists[gapType] is JsonArray gapUrls)
        {
            urls = gapUrls;
        }

        var totalAll = urls.Count;
        if (cov["lists_total"] is JsonObject totals && totals[gapType] is JsonValue totalValue)
        {
            totalAll = totalValue.GetValue<int?>() ?? urls.Count;
        }

        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 50, 200);
        var sliced = PayloadSliceHelpers.CapList(urls.ToList(), limit, 200);
        var truncated = sliced["truncated"]?.GetValue<bool?>() == true || totalAll > limit;
        return new JsonObject
        {
            ["gap_type"] = gapType,
            ["urls"] = sliced["items"]?.DeepClone(),
            ["total"] = totalAll,
            ["truncated"] = truncated,
            ["counts"] = cov["counts"]?.DeepClone(),
        };
    }

    public static async Task<JsonObject> GetIndexationUrlJoinAsync(
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

        if (payload["indexation_coverage"] is not JsonObject cov)
        {
            return new JsonObject { ["error"] = "indexation_coverage not in report", ["missing"] = true };
        }

        if (cov["url_join"] is null)
        {
            return new JsonObject { ["error"] = "url_join not in indexation_coverage", ["missing"] = true };
        }

        return new JsonObject
        {
            ["url_join"] = cov["url_join"]?.DeepClone(),
            ["counts"] = cov["counts"]?.DeepClone(),
        };
    }
}
