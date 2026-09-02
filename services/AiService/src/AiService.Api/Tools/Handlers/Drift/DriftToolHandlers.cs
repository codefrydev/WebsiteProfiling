using System.Text.Json.Nodes;
using AiService.Api.Tools.Compare;
using AiService.Api.Tools.Context;
using AiService.Api.Tools.Handlers.Google;
using AiService.Api.Tools.Persistence;
using AiService.Api.Tools.Slice;
using Microsoft.EntityFrameworkCore;
using WebsiteProfiling.Contracts.Json;

namespace AiService.Api.Tools.Handlers.Drift;

/// <summary>
/// Report compare/drift tools — ports Python <c>compare/compare_slices.py</c>, <c>compare/compare.py</c>,
/// <c>compare/compare_list_tools.py</c>, and <c>portfolio/health.py::get_health_history</c>.
/// <c>compare_geo_score_deltas</c> (classified under the <c>geo</c> domain — live HTTP GEO scoring)
/// and <c>get_integration_alerts</c> (separate alerts subsystem — SMTP/webhook + all-properties scan)
/// are deferred, see <c>CHAT_DOTNET_MIGRATION.md</c>.
/// </summary>
public static class DriftToolHandlers
{
    private static JsonObject SimpleError(string error) => new() { ["error"] = error };

    private static JsonObject ListError(string itemKey, string error) => new()
    {
        ["error"] = error,
        [itemKey] = new JsonArray(),
        ["total"] = 0,
        ["truncated"] = false,
    };

    private static JsonObject CompareMeta(long? currentRid, long? baselineRid, JsonObject current, JsonObject baseline) => new()
    {
        ["current_report_id"] = currentRid,
        ["baseline_report_id"] = baselineRid,
        ["current_generated_at"] = current["report_generated_at"]?.DeepClone(),
        ["baseline_generated_at"] = baseline["report_generated_at"]?.DeepClone(),
    };

    private static async Task<JsonObject> CompareListAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken,
        Func<JsonObject, JsonObject, List<JsonObject>> builder,
        string resultKey,
        int defaultLimit = 50,
        int maxCap = 100)
    {
        var (current, baseline, curRid, baseRid, error) = await ctx.WithArgs(args).LoadComparePairAsync(db, args, cancellationToken);
        if (error is not null)
        {
            return SimpleError(error);
        }

        var items = builder(current!, baseline!);
        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], defaultLimit, maxCap);
        var sliced = PayloadSliceHelpers.CapList(items.Cast<JsonNode?>().ToList(), limit, maxCap);
        var result = CompareMeta(curRid, baseRid, current!, baseline!);
        result[resultKey] = sliced["items"]?.DeepClone();
        result["total"] = sliced["total"]?.DeepClone();
        result["truncated"] = sliced["truncated"]?.DeepClone();
        return result;
    }

    public static Task<JsonObject> CompareIssueDeltasAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
        => CompareListAsync(db, ctx, args, cancellationToken, CompareHelpers.BuildIssueDeltas, "issue_deltas", 50, 100);

    public static Task<JsonObject> CompareLighthouseDeltasAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
        => CompareListAsync(db, ctx, args, cancellationToken, CompareHelpers.BuildLighthouseUrlDeltas, "lighthouse_url_deltas", 30, 50);

    public static Task<JsonObject> CompareRedirectDeltasAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
        => CompareListAsync(db, ctx, args, cancellationToken, CompareHelpers.BuildRedirectDeltas, "redirect_deltas", 50, 100);

    public static Task<JsonObject> CompareLinkMetricDeltasAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
        => CompareListAsync(db, ctx, args, cancellationToken, CompareHelpers.BuildLinkMetricDeltas, "link_metric_deltas", 50, 200);

    public static Task<JsonObject> CompareSecurityDeltasAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
        => CompareListAsync(db, ctx, args, cancellationToken, CompareHelpers.BuildSecurityDeltas, "security_deltas");

    public static Task<JsonObject> CompareDuplicateDeltasAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
        => CompareListAsync(db, ctx, args, cancellationToken, CompareHelpers.BuildDuplicateDeltas, "duplicate_deltas");

    public static Task<JsonObject> CompareTechDeltasAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
        => CompareListAsync(db, ctx, args, cancellationToken, CompareHelpers.BuildTechDeltas, "tech_deltas");

    public static async Task<JsonObject> CompareCategoryDeltasAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
    {
        var (current, baseline, curRid, baseRid, error) = await ctx.WithArgs(args).LoadComparePairAsync(db, args, cancellationToken);
        if (error is not null)
        {
            return SimpleError(error);
        }

        var result = CompareMeta(curRid, baseRid, current!, baseline!);
        result["category_scores"] = new JsonArray(CompareHelpers.BuildCategoryScores(current!, baseline!).Select(r => (JsonNode?)r).ToArray());
        return result;
    }

    public static async Task<JsonObject> CompareSeoHealthDeltasAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
    {
        var (current, baseline, curRid, baseRid, error) = await ctx.WithArgs(args).LoadComparePairAsync(db, args, cancellationToken);
        if (error is not null)
        {
            return SimpleError(error);
        }

        var result = CompareMeta(curRid, baseRid, current!, baseline!);
        result["seo_health_metrics"] = new JsonArray(CompareHelpers.BuildSeoHealthDeltas(current!, baseline!).Select(r => (JsonNode?)r).ToArray());
        return result;
    }

    public static async Task<JsonObject> CompareContentMetricsAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
    {
        var (current, baseline, curRid, baseRid, error) = await ctx.WithArgs(args).LoadComparePairAsync(db, args, cancellationToken);
        if (error is not null)
        {
            return SimpleError(error);
        }

        var result = CompareMeta(curRid, baseRid, current!, baseline!);
        result["content_metrics"] = new JsonArray(CompareHelpers.BuildContentMetrics(current!, baseline!).Select(r => (JsonNode?)r).ToArray());
        return result;
    }

    public static async Task<JsonObject> CompareGoogleMetricsAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
    {
        var (current, baseline, curRid, baseRid, error) = await ctx.WithArgs(args).LoadComparePairAsync(db, args, cancellationToken);
        if (error is not null)
        {
            return SimpleError(error);
        }

        var google = CompareHelpers.BuildGoogleMetrics(current!, baseline!);
        var result = CompareMeta(curRid, baseRid, current!, baseline!);
        result["google_available"] = google["available"]?.DeepClone() ?? false;
        result["google_metrics"] = google["metrics"]?.DeepClone() ?? new JsonArray();
        return result;
    }

    public static async Task<JsonObject> ComparePriorityCountsAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
    {
        var (current, baseline, curRid, baseRid, error) = await ctx.WithArgs(args).LoadComparePairAsync(db, args, cancellationToken);
        if (error is not null)
        {
            return SimpleError(error);
        }

        var result = CompareMeta(curRid, baseRid, current!, baseline!);
        result["priority_counts"] = new JsonArray(CompareHelpers.BuildPriorityCounts(current!, baseline!).Select(r => (JsonNode?)r).ToArray());
        return result;
    }

    public static async Task<JsonObject> CompareHealthScoreDeltaAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
    {
        var (current, baseline, curRid, baseRid, error) = await ctx.WithArgs(args).LoadComparePairAsync(db, args, cancellationToken);
        if (error is not null)
        {
            return SimpleError(error);
        }

        var curHealth = CompareHelpers.ScoreFromCategories(current!["categories"] as JsonArray);
        var baseHealth = CompareHelpers.ScoreFromCategories(baseline!["categories"] as JsonArray);
        var result = CompareMeta(curRid, baseRid, current!, baseline!);
        result["health_score"] = new JsonObject
        {
            ["current"] = curHealth,
            ["baseline"] = baseHealth,
            ["delta"] = curHealth is not null && baseHealth is not null ? curHealth - baseHealth : null,
        };
        return result;
    }

    public static async Task<JsonObject> CompareIndexationDeltasAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
    {
        var (current, baseline, curRid, baseRid, error) = await ctx.WithArgs(args).LoadComparePairAsync(db, args, cancellationToken);
        if (error is not null)
        {
            return SimpleError(error);
        }

        var result = CompareMeta(curRid, baseRid, current!, baseline!);
        var deltas = CompareHelpers.BuildIndexationDeltas(current!, baseline!);
        foreach (var (key, value) in deltas)
        {
            result[key] = value?.DeepClone();
        }

        return result;
    }

    public static async Task<JsonObject> CompareOrphanDeltasAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
    {
        var (current, baseline, curRid, baseRid, error) = await ctx.WithArgs(args).LoadComparePairAsync(db, args, cancellationToken);
        if (error is not null)
        {
            return SimpleError(error);
        }

        var result = CompareMeta(curRid, baseRid, current!, baseline!);
        var deltas = CompareHelpers.BuildOrphanDeltas(current!, baseline!);
        foreach (var (key, value) in deltas)
        {
            result[key] = value?.DeepClone();
        }

        return result;
    }

    public static async Task<JsonObject> CompareUrlSetDiffAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
    {
        var (current, baseline, curRid, baseRid, error) = await ctx.WithArgs(args).LoadComparePairAsync(db, args, cancellationToken);
        if (error is not null)
        {
            return SimpleError(error);
        }

        var diff = CompareHelpers.BuildUrlSetDiff(current!, baseline!);
        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 50, 200);
        var newUrls = (diff["new_urls"] as JsonArray ?? []).ToList();
        var removedUrls = (diff["removed_urls"] as JsonArray ?? []).ToList();
        var newSliced = PayloadSliceHelpers.CapList(newUrls, limit, 200);
        var removedSliced = PayloadSliceHelpers.CapList(removedUrls, limit, 200);
        var result = CompareMeta(curRid, baseRid, current!, baseline!);
        result["new_urls"] = newSliced["items"]?.DeepClone();
        result["new_count"] = diff["new_count"]?.DeepClone();
        result["new_truncated"] = newSliced["truncated"]?.DeepClone();
        result["removed_urls"] = removedSliced["items"]?.DeepClone();
        result["removed_count"] = diff["removed_count"]?.DeepClone();
        result["removed_truncated"] = removedSliced["truncated"]?.DeepClone();
        return result;
    }

    public static async Task<JsonObject> CompareReportsAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
    {
        var (current, baseline, curRid, baseRid, error) = await ctx.WithArgs(args).LoadComparePairAsync(db, args, cancellationToken);
        if (error is not null)
        {
            return SimpleError(error);
        }

        return CompareHelpers.BuildFullCompare(current!, baseline!, curRid, baseRid);
    }

    public static async Task<JsonObject> ListCompareNewIssuesAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
    {
        var (current, baseline, curRid, baseRid, error) = await ctx.WithArgs(args).LoadComparePairAsync(db, args, cancellationToken);
        if (error is not null)
        {
            return ListError("issues", error);
        }

        var deltas = CompareHelpers.BuildIssueDeltas(current!, baseline!).Where(d => JsonCoercion.AsString(d["kind"]) == "new").ToList();
        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 50, 100);
        var sliced = PayloadSliceHelpers.CapList(deltas.Cast<JsonNode?>().ToList(), limit, 100);
        var result = CompareMeta(curRid, baseRid, current!, baseline!);
        result["issues"] = sliced["items"]?.DeepClone();
        result["total"] = sliced["total"]?.DeepClone();
        result["truncated"] = sliced["truncated"]?.DeepClone();
        return result;
    }

    public static async Task<JsonObject> ListCompareResolvedIssuesAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
    {
        var (current, baseline, curRid, baseRid, error) = await ctx.WithArgs(args).LoadComparePairAsync(db, args, cancellationToken);
        if (error is not null)
        {
            return ListError("issues", error);
        }

        var deltas = CompareHelpers.BuildIssueDeltas(current!, baseline!).Where(d => JsonCoercion.AsString(d["kind"]) == "resolved").ToList();
        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 50, 100);
        var sliced = PayloadSliceHelpers.CapList(deltas.Cast<JsonNode?>().ToList(), limit, 100);
        var result = CompareMeta(curRid, baseRid, current!, baseline!);
        result["issues"] = sliced["items"]?.DeepClone();
        result["total"] = sliced["total"]?.DeepClone();
        result["truncated"] = sliced["truncated"]?.DeepClone();
        return result;
    }

    public static async Task<JsonObject> ListCompareNewUrlsAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
    {
        var (current, baseline, curRid, baseRid, error) = await ctx.WithArgs(args).LoadComparePairAsync(db, args, cancellationToken);
        if (error is not null)
        {
            return ListError("urls", error);
        }

        var diff = CompareHelpers.BuildUrlSetDiff(current!, baseline!);
        var newUrls = (diff["new_urls"] as JsonArray ?? []).ToList();
        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 50, 200);
        var sliced = PayloadSliceHelpers.CapList(newUrls, limit, 200);
        var result = CompareMeta(curRid, baseRid, current!, baseline!);
        result["urls"] = sliced["items"]?.DeepClone();
        result["total"] = diff["new_count"]?.DeepClone();
        result["truncated"] = sliced["truncated"]?.DeepClone();
        return result;
    }

    public static async Task<JsonObject> ListCompareRemovedUrlsAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
    {
        var (current, baseline, curRid, baseRid, error) = await ctx.WithArgs(args).LoadComparePairAsync(db, args, cancellationToken);
        if (error is not null)
        {
            return ListError("urls", error);
        }

        var diff = CompareHelpers.BuildUrlSetDiff(current!, baseline!);
        var removedUrls = (diff["removed_urls"] as JsonArray ?? []).ToList();
        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 50, 200);
        var sliced = PayloadSliceHelpers.CapList(removedUrls, limit, 200);
        var result = CompareMeta(curRid, baseRid, current!, baseline!);
        result["urls"] = sliced["items"]?.DeepClone();
        result["total"] = diff["removed_count"]?.DeepClone();
        result["truncated"] = sliced["truncated"]?.DeepClone();
        return result;
    }

    public static async Task<JsonObject> ListCompareLighthouseRegressionsAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
    {
        var (current, baseline, curRid, baseRid, error) = await ctx.WithArgs(args).LoadComparePairAsync(db, args, cancellationToken);
        if (error is not null)
        {
            return ListError("pages", error);
        }

        var minDrop = JsonCoercion.Num(args["min_regression"], 5);
        var deltas = CompareHelpers.BuildLighthouseUrlDeltas(current!, baseline!);
        var regressions = new List<JsonObject>();
        foreach (var row in deltas)
        {
            var perfDelta = JsonCoercion.AsDouble(row["performance_delta"]);
            var seoDelta = JsonCoercion.AsDouble(row["seo_delta"]);
            var perfDrop = perfDelta is not null && perfDelta <= -minDrop;
            var seoDrop = seoDelta is not null && seoDelta <= -minDrop;
            if (perfDrop || seoDrop)
            {
                var clone = (JsonObject)row.DeepClone();
                clone["regression_type"] = perfDrop ? "performance" : "seo";
                regressions.Add(clone);
            }
        }

        regressions = regressions
            .OrderBy(r => Math.Min(JsonCoercion.AsDouble(r["performance_delta"]) ?? 0, JsonCoercion.AsDouble(r["seo_delta"]) ?? 0))
            .ToList();
        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 30, 50);
        var sliced = PayloadSliceHelpers.CapList(regressions.Cast<JsonNode?>().ToList(), limit, 50);
        var result = CompareMeta(curRid, baseRid, current!, baseline!);
        result["pages"] = sliced["items"]?.DeepClone();
        result["total"] = sliced["total"]?.DeepClone();
        result["truncated"] = sliced["truncated"]?.DeepClone();
        result["min_regression"] = minDrop;
        return result;
    }

    public static async Task<JsonObject> ListCompareTrafficLosersAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var (current, baseline, curRid, baseRid, error) = await scoped.LoadComparePairAsync(db, args, cancellationToken);
        if (error is not null)
        {
            return ListError("pages", error);
        }

        var curGoogle = current!["google"] as JsonObject;
        var baseGoogle = baseline!["google"] as JsonObject;
        if (curGoogle is null)
        {
            curGoogle = await scoped.LoadGoogleFullAsync(db, cancellationToken) ?? await scoped.LoadGoogleAsync(db, cancellationToken);
        }

        var result = CompareMeta(curRid, baseRid, current, baseline);
        if (curGoogle is null || baseGoogle is null)
        {
            result["error"] = "google data missing on current or baseline report";
            result["missing"] = true;
            result["pages"] = new JsonArray();
            result["total"] = 0;
            result["truncated"] = false;
            return result;
        }

        var curPages = IndexGscRows(GoogleToolHandlers.GscRows(curGoogle, "pages"), "page", "url");
        var basePages = IndexGscRows(GoogleToolHandlers.GscRows(baseGoogle, "pages"), "page", "url");

        var losers = new List<JsonObject>();
        foreach (var (key, curRow) in curPages)
        {
            if (!basePages.TryGetValue(key, out var baseRow))
            {
                continue;
            }

            var curClicks = JsonCoercion.Num(curRow["clicks"]);
            var baseClicks = JsonCoercion.Num(baseRow["clicks"]);
            var delta = curClicks - baseClicks;
            if (delta >= 0)
            {
                continue;
            }

            losers.Add(new JsonObject
            {
                ["url"] = JsonCoercion.AsString(curRow["page"]) ?? key,
                ["clicks_current"] = curClicks,
                ["clicks_baseline"] = baseClicks,
                ["click_delta"] = delta,
                ["impressions_current"] = JsonCoercion.Num(curRow["impressions"]),
                ["impressions_baseline"] = JsonCoercion.Num(baseRow["impressions"]),
            });
        }

        losers = losers.OrderBy(r => JsonCoercion.Num(r["click_delta"])).ToList();
        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 30, 50);
        var sliced = PayloadSliceHelpers.CapList(losers.Cast<JsonNode?>().ToList(), limit, 50);
        result["pages"] = sliced["items"]?.DeepClone();
        result["total"] = sliced["total"]?.DeepClone();
        result["truncated"] = sliced["truncated"]?.DeepClone();
        return result;
    }

    private static Dictionary<string, JsonObject> IndexGscRows(List<JsonObject> rows, params string[] keyFields)
    {
        var result = new Dictionary<string, JsonObject>();
        foreach (var row in rows)
        {
            string key = "";
            foreach (var field in keyFields)
            {
                key = (JsonCoercion.AsString(row[field]) ?? "").Trim();
                if (key.Length > 0)
                {
                    break;
                }
            }

            if (key.Length > 0)
            {
                result[key] = row;
            }
        }

        return result;
    }

    public static async Task<JsonObject> GetHealthHistoryAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        if (scoped.PropertyId is not long propertyId)
        {
            return new JsonObject { ["error"] = "property_id is required" };
        }

        var limit = Math.Max(1, Math.Min((int)JsonCoercion.Num(args["limit"], 10), 30));
        var rows = await db.AuditHealthSnapshots.AsNoTracking()
            .Where(x => x.PropertyId == propertyId)
            .OrderByDescending(x => x.GeneratedAt)
            .ThenByDescending(x => x.Id)
            .Take(limit)
            .ToListAsync(cancellationToken);

        var snapshots = new JsonArray(rows.Select(r => (JsonNode?)new JsonObject
        {
            ["health_score"] = r.HealthScore,
            ["category_scores"] = JsonNode.Parse(string.IsNullOrWhiteSpace(r.CategoryScores) ? "{}" : r.CategoryScores),
            ["issue_counts"] = JsonNode.Parse(string.IsNullOrWhiteSpace(r.IssueCounts) ? "{}" : r.IssueCounts),
            ["generated_at"] = r.GeneratedAt.ToString("O"),
            ["report_id"] = r.ReportId,
        }).ToArray());

        return new JsonObject
        {
            ["property_id"] = propertyId,
            ["snapshots"] = snapshots,
            ["count"] = rows.Count,
        };
    }
}
