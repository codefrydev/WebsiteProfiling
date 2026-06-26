using System.Text.Json.Nodes;
using AiService.Tools.Context;
using AiService.Tools.Slice;
using WebsiteProfiling.Contracts.Json;

using AiService.Tools.Persistence;
namespace AiService.Tools.Handlers.Performance;

/// <summary>Lighthouse performance tools — ports Python <c>performance/lighthouse.py</c> (payload-only paths).</summary>
public static class PerformanceToolHandlers
{
    public static async Task<JsonObject> GetLighthouseSummaryAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var payload = await scoped.LoadPayloadAsync(db, cancellationToken);
        var summary = payload["lighthouse_summary"] as JsonObject ?? [];
        var human = payload["lighthouse_human_summary"];
        var diagnostics = payload["lighthouse_diagnostics"] as JsonArray;
        var pageSummaries = payload["lighthouse_by_url"] as JsonObject ?? [];

        var poorPages = new JsonArray();
        foreach (var (url, node) in pageSummaries.Take(20))
        {
            if (node is not JsonObject data)
            {
                continue;
            }

            var perf = ExtractScore(data, "performance");
            if (perf is not null && perf < 50)
            {
                poorPages.Add(new JsonObject { ["url"] = url, ["performance"] = perf });
            }
        }

        return new JsonObject
        {
            ["summary"] = summary.DeepClone(),
            ["human_summary"] = human is JsonValue hv && hv.TryGetValue(out string? text) ? text : null,
            ["diagnostics_count"] = diagnostics?.Count ?? 0,
            ["pages_audited"] = pageSummaries.Count,
            ["poor_performance_pages"] = new JsonArray(poorPages.Take(10).Select(n => n?.DeepClone()).ToArray()),
        };
    }

    public static async Task<JsonObject> GetLighthouseForUrlAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var url = (JsonCoercion.AsString(args["url"]) ?? "").Trim().TrimEnd('/');
        if (url.Length == 0)
        {
            return new JsonObject { ["error"] = "url is required" };
        }

        var scoped = ctx.WithArgs(args);
        var payload = await scoped.LoadPayloadAsync(db, cancellationToken);
        var byUrl = payload["lighthouse_by_url"] as JsonObject ?? [];
        JsonNode? data = byUrl[url] ?? byUrl[url + "/"];
        if (data is null)
        {
            return new JsonObject { ["error"] = "no lighthouse data for url", ["url"] = url };
        }

        return new JsonObject { ["url"] = url, ["lighthouse"] = data.DeepClone() };
    }

    public static Task<JsonObject> GetLighthouseDiagnosticsAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
        => PayloadArrayHelpers.CapPayloadArrayAsync(db, ctx, args, "lighthouse_diagnostics", "diagnostics", 30, 50, cancellationToken);

    public static async Task<JsonObject> ListSlowPagesAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var threshold = PayloadSliceHelpers.ParseLimit(args["performance_threshold"], 50, 100);
        return await ListPoorLighthousePagesAsync(db, ctx, args, ["performance"], "performance", threshold, cancellationToken);
    }

    public static async Task<JsonObject> GetLighthouseHumanSummaryAsync(
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

        var text = JsonCoercion.AsString(payload["lighthouse_human_summary"]) ?? "";
        if (string.IsNullOrWhiteSpace(text) && payload["lighthouse_summary"] is JsonObject summary)
        {
            text = JsonCoercion.AsString(summary["human_summary_full"])
                ?? JsonCoercion.AsString(summary["human_summary"])
                ?? "";
        }

        return new JsonObject
        {
            ["human_summary"] = text,
            ["has_summary"] = !string.IsNullOrWhiteSpace(text),
        };
    }

    public static async Task<JsonObject> ListLighthousePoorSeoPagesAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var threshold = PayloadSliceHelpers.ParseLimit(args["seo_threshold"], 80, 100);
        return await ListPoorLighthousePagesAsync(db, ctx, args, ["seo"], "seo", threshold, cancellationToken);
    }

    private static async Task<JsonObject> ListPoorLighthousePagesAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        string[] scoreKeys,
        string resultKey,
        int threshold,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var payload = await scoped.LoadPayloadAsync(db, cancellationToken);
        if (payload.Count == 0)
        {
            return new JsonObject { ["error"] = "no report found", ["pages"] = new JsonArray(), ["total"] = 0 };
        }

        var byUrl = payload["lighthouse_by_url"] as JsonObject ?? [];
        var poor = new List<JsonObject>();
        foreach (var (url, node) in byUrl)
        {
            if (node is not JsonObject data)
            {
                continue;
            }

            var score = ExtractScore(data, scoreKeys);
            if (score is not null && score < threshold)
            {
                poor.Add(new JsonObject { ["url"] = url, [resultKey] = score });
            }
        }

        poor.Sort((a, b) => (a[resultKey]?.GetValue<double?>() ?? 0).CompareTo(b[resultKey]?.GetValue<double?>() ?? 0));
        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 30, 50);
        var sliced = PayloadSliceHelpers.CapList(poor.Cast<JsonNode?>().ToList(), limit, 50);
        return new JsonObject
        {
            ["pages"] = sliced["items"]?.DeepClone(),
            ["total"] = sliced["total"]?.DeepClone(),
            ["truncated"] = sliced["truncated"]?.DeepClone(),
            ["threshold"] = threshold,
        };
    }

    private static double? ExtractScore(JsonObject data, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (data[key] is JsonValue value && value.TryGetValue(out double score))
            {
                return score;
            }
        }

        if (data["scores"] is JsonObject scores)
        {
            foreach (var key in keys)
            {
                if (scores[key] is JsonValue value && value.TryGetValue(out double score))
                {
                    return score;
                }
            }
        }

        return null;
    }
}
