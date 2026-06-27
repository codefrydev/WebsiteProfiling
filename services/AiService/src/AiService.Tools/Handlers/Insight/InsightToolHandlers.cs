using System.Text.Json.Nodes;
using AiService.Tools.Context;
using AiService.Tools.Mapping;
using AiService.Tools.Models.Insight;
using AiService.Tools.Slice;
using WebsiteProfiling.Contracts.Json;

using AiService.Tools.Persistence;
namespace AiService.Tools.Handlers.Insight;

/// <summary>
/// Native cross-platform insight tools (GSC + GA4 blending). Faithful port of Python
/// <c>website_profiling.tools.audit_tools.insight.insight_tools</c>.
/// </summary>
public static class InsightToolHandlers
{
    public static async Task<JsonObject> GetLandingPageBlendedTableAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var parsedArgs = ToolArgsMapper.Parse<BlendedTableArgs>(args);
        var result = await BuildBlendedTableAsync(db, scoped, parsedArgs, cancellationToken);
        return ToolResultMapper.ToJsonObject(result);
    }

    public static async Task<JsonObject> GetOpportunityMatrixAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var parsedArgs = ToolArgsMapper.Parse<BlendedTableArgs>(args);
        var blended = await BuildBlendedTableAsync(db, scoped, parsedArgs, cancellationToken);
        if (blended.Error is not null)
        {
            return ToolResultMapper.ToJsonObject(blended);
        }

        var quadrants = new Dictionary<string, IReadOnlyList<LandingPageBlendedRow>>(StringComparer.Ordinal)
        {
            ["high_impact"] = [],
            ["worth_optimizing"] = [],
            ["good_but_capped"] = [],
            ["low_priority"] = [],
        };

        foreach (var row in blended.Rows)
        {
            var key = row.Quadrant;
            if (!quadrants.ContainsKey(key))
            {
                quadrants[key] = [];
            }

            quadrants[key] = quadrants[key].Append(row).ToList();
        }

        var counts = quadrants.ToDictionary(kv => kv.Key, kv => kv.Value.Count, StringComparer.Ordinal);
        var highImpact = counts.GetValueOrDefault("high_impact");
        var worthOptimizing = counts.GetValueOrDefault("worth_optimizing");

        var matrix = new OpportunityMatrixResult
        {
            Quadrants = quadrants,
            Counts = counts,
            Provenance = blended.Provenance,
            Insights =
            [
                $"Focus on {highImpact} high-impact pages first.",
                $"{worthOptimizing} pages could rank higher with on-page work.",
            ],
        };

        return ToolResultMapper.ToJsonObject(matrix);
    }

    public static async Task<JsonObject> GetTrafficHealthCheckAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var raw = await scoped.LoadGoogleFullAsync(db, cancellationToken)
            ?? await scoped.LoadGoogleAsync(db, cancellationToken);
        if (raw is null)
        {
            return ToolResultMapper.ToJsonObject(new TrafficHealthResult
            {
                Error = "no google data found",
                Missing = true,
            });
        }

        var slice = PayloadSliceMapper.ToGoogleSlice(raw);
        var health = InsightLogic.TrafficHealth(slice?.Gsc?.Summary, slice?.Ga4?.Summary);
        var result = health with
        {
            Provenance = InsightLogic.ProvenanceBlockTyped(["gsc", "ga4"], JsonCoercion.AsString(raw["fetched_at"])),
            Insights = [health.Note],
        };

        return ToolResultMapper.ToJsonObject(result);
    }

    private static async Task<BlendedTableResult> BuildBlendedTableAsync(
        AuditToolsDbContext db,
        AuditToolContext scoped,
        BlendedTableArgs args,
        CancellationToken cancellationToken)
    {
        var raw = await scoped.LoadGoogleFullAsync(db, cancellationToken);
        if (raw is null)
        {
            return new BlendedTableResult
            {
                Error = "no google data found",
                Missing = true,
                Rows = [],
            };
        }

        var slice = PayloadSliceMapper.ToGoogleSlice(raw);
        if (slice is null)
        {
            return new BlendedTableResult
            {
                Error = "no google data found",
                Missing = true,
                Rows = [],
            };
        }

        if (slice.Gsc?.ByPage is not { Count: > 0 })
        {
            var (gsc, _) = InsightLogic.GscGa4Blobs(raw);
            if (gsc["top_pages"] is JsonArray topPages)
            {
                var rebuilt = new Dictionary<string, WebsiteProfiling.Contracts.Google.GscPageRecord>(StringComparer.Ordinal);
                foreach (var item in topPages)
                {
                    if (item is JsonObject row
                        && row["page"] is JsonValue pageValue
                        && pageValue.TryGetValue<string>(out var page)
                        && !string.IsNullOrEmpty(page))
                    {
                        rebuilt[page] = new WebsiteProfiling.Contracts.Google.GscPageRecord
                        {
                            Page = page,
                            Clicks = (int)InsightLogic.Num(row["clicks"]),
                            Impressions = (int)InsightLogic.Num(row["impressions"]),
                            Ctr = InsightLogic.Num(row["ctr"]),
                            Position = InsightLogic.Num(row["position"]),
                        };
                    }
                }

                slice = slice with { Gsc = new WebsiteProfiling.Contracts.Google.GoogleSlice.GscBlob { ByPage = rebuilt } };
            }
        }

        var limit = Math.Max(1, Math.Min(args.Limit ?? 30, 100));
        var minImpressions = Math.Max(0, Math.Min(args.MinImpressions ?? 0, 1_000_000));
        var rows = InsightLogic.BlendLandingPagesTyped(slice, limit, minImpressions);

        var highImpact = rows.Count(r => r.Quadrant == "high_impact");
        var worthOptimizing = rows.Count(r => r.Quadrant == "worth_optimizing");
        var totalPages = slice.Gsc?.ByPage.Count ?? 0;

        return new BlendedTableResult
        {
            Rows = rows,
            Total = rows.Count,
            Truncated = totalPages > limit,
            Provenance = InsightLogic.ProvenanceBlockTyped(["gsc", "ga4"], JsonCoercion.AsString(raw["fetched_at"])),
            Insights =
            [
                $"{highImpact} high-impact landing pages",
                $"{worthOptimizing} worth optimizing for rank",
            ],
        };
    }

    public static async Task<JsonObject> GetIssueToTrafficMapAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var withSort = args.DeepClone() as JsonObject ?? [];
        withSort["sort"] = "impact";
        var result = await Handlers.Report.ReportToolHandlers.ListIssuesAsync(db, ctx, withSort, cancellationToken);
        if (result.TryGetPropertyValue("error", out _))
        {
            return result;
        }

        var rows = new JsonArray();
        if (result["issues"] is JsonArray issues)
        {
            foreach (var node in issues)
            {
                if (node is not JsonObject issue)
                {
                    continue;
                }

                rows.Add(new JsonObject
                {
                    ["url"] = issue["url"]?.DeepClone(),
                    ["priority"] = issue["priority"]?.DeepClone(),
                    ["category"] = issue["category"]?.DeepClone(),
                    ["message"] = issue["message"]?.DeepClone(),
                    ["impact_score"] = issue["impact_score"]?.DeepClone(),
                    ["gsc_clicks"] = issue["gsc_clicks"]?.DeepClone(),
                    ["ga4_sessions"] = issue["ga4_sessions"]?.DeepClone(),
                });
            }
        }

        return new JsonObject
        {
            ["issues"] = rows,
            ["total"] = result["total"]?.DeepClone(),
            ["truncated"] = result["truncated"]?.DeepClone(),
            ["provenance"] = InsightLogic.ProvenanceBlockJson(["audit", "gsc", "ga4"], null),
            ["insights"] = new JsonArray(JsonValue.Create("Issues sorted by traffic-weighted impact_score.")),
        };
    }

    public static async Task<JsonObject> GetLandingPageFullDiagnosisAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var url = JsonCoercion.AsString(args["url"])?.Trim() ?? "";
        if (string.IsNullOrEmpty(url))
        {
            return new JsonObject { ["error"] = "url is required" };
        }

        var payload = await scoped.LoadPayloadAsync(db, cancellationToken);
        if (payload.Count == 0)
        {
            return new JsonObject { ["error"] = "no report found", ["missing"] = true };
        }

        var raw = await scoped.LoadGoogleFullAsync(db, cancellationToken)
            ?? await scoped.LoadGoogleAsync(db, cancellationToken)
            ?? [];
        var sliceData = InsightLogic.SliceFromGoogleRow(raw, url);
        var flags = InsightLogic.PageIssueFlags(url, payload);
        var lh = InsightLogic.LookupLighthouse(url, payload);
        var score = InsightLogic.CompositePageScore(sliceData, flags, lh);
        JsonObject? crawlRow = null;
        if (payload["top_pages"] is JsonArray topPages)
        {
            foreach (var node in topPages)
            {
                if (node is JsonObject row
                    && string.Equals(JsonCoercion.AsString(row["url"])?.Trim(),
                        url.Trim(), StringComparison.OrdinalIgnoreCase))
                {
                    crawlRow = row;
                    break;
                }
            }
        }

        return new JsonObject
        {
            ["url"] = url,
            ["gsc_ga4"] = sliceData,
            ["issues"] = flags,
            ["lighthouse"] = lh?.DeepClone(),
            ["crawl"] = crawlRow?.DeepClone(),
            ["diagnosis"] = score,
            ["provenance"] = InsightLogic.ProvenanceBlockJson(
                ["gsc", "ga4", "crawl", "audit"],
                raw["fetched_at"] ?? payload["report_generated_at"]),
            ["insights"] = score["flags"] as JsonArray ?? new JsonArray(),
        };
    }
}
