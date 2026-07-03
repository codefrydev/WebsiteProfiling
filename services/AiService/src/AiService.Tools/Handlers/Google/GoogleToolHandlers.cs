using System.Text.Json.Nodes;
using AiService.Tools.Context;
using AiService.Tools.Slice;
using WebsiteProfiling.Contracts.Json;

using AiService.Tools.Persistence;
namespace AiService.Tools.Handlers.Google;

public static class GoogleToolHandlers
{
    public static async Task<JsonObject> GetGoogleSummaryAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var data = await scoped.LoadGoogleAsync(db, cancellationToken);
        if (data is null)
        {
            return new JsonObject
            {
                ["error"] = "no google data found",
                ["property_id"] = scoped.PropertyId,
            };
        }

        var gsc = data["gsc"] as JsonObject ?? [];
        var ga4 = data["ga4"] as JsonObject ?? [];
        var gscSummary = gsc["summary"] as JsonObject ?? [];
        var ga4Summary = ga4["summary"] as JsonObject ?? [];

        var topQueries = CapJsonList(gsc["top_queries"], 10);
        var topPages = CapJsonList(gsc["top_pages"], 10);
        var ga4TopPages = CapJsonList(ga4["top_pages"], 10);

        return new JsonObject
        {
            ["fetched_at"] = data["fetched_at"]?.DeepClone(),
            ["date_range"] = data["date_range"]?.DeepClone(),
            ["gsc"] = new JsonObject
            {
                ["site_url"] = gsc["site_url"]?.DeepClone(),
                ["summary"] = gscSummary.DeepClone(),
                ["top_queries"] = topQueries,
                ["top_pages"] = topPages,
            },
            ["ga4"] = new JsonObject
            {
                ["property_id"] = ga4["property_id"]?.DeepClone(),
                ["summary"] = ga4Summary.DeepClone(),
                ["top_pages"] = ga4TopPages,
            },
            ["errors"] = data["errors"] is JsonArray errors ? errors.DeepClone() : new JsonArray(),
            ["property_id"] = scoped.PropertyId,
        };
    }

    private static JsonArray CapJsonList(JsonNode? raw, int max)
    {
        if (raw is not JsonArray array)
        {
            return [];
        }

        var capped = new JsonArray();
        for (var i = 0; i < Math.Min(max, array.Count); i++)
        {
            capped.Add(array[i]?.DeepClone());
        }

        return capped;
    }

    public static async Task<JsonObject> GetGscTopQueriesAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
        => await CapGoogleListAsync(db, ctx, args, "gsc", ["top_queries", "queries"], "queries", cancellationToken);

    public static async Task<JsonObject> GetGscTopPagesAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
        => await CapGoogleListAsync(db, ctx, args, "gsc", ["top_pages", "pages"], "pages", cancellationToken);

    public static Task<JsonObject> ListGscQueriesByImpressionsAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
        => ListGscSortedAsync(db, ctx, args, "queries", "queries", "impressions", cancellationToken);

    public static Task<JsonObject> ListGscQueriesByClicksAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
        => ListGscSortedAsync(db, ctx, args, "queries", "queries", "clicks", cancellationToken);

    public static Task<JsonObject> ListGscPagesByImpressionsAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
        => ListGscSortedAsync(db, ctx, args, "pages", "pages", "impressions", cancellationToken);

    public static Task<JsonObject> ListGscPagesByClicksAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
        => ListGscSortedAsync(db, ctx, args, "pages", "pages", "clicks", cancellationToken);

    public static async Task<JsonObject> GetGa4SummaryAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var data = await scoped.LoadGoogleAsync(db, cancellationToken);
        if (data is null)
        {
            return new JsonObject { ["error"] = "no google data found" };
        }

        var ga4 = data["ga4"] as JsonObject;
        if (ga4 is null || ga4.Count == 0)
        {
            return new JsonObject
            {
                ["error"] = "no GA4 data — connect GA4 property in Integrations",
                ["missing"] = true,
            };
        }

        var topPages = ga4["top_pages"] as JsonArray ?? [];
        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 20, 50);
        var sliced = PayloadSliceHelpers.CapList(topPages.ToList(), limit, 50);
        return new JsonObject
        {
            ["property_id"] = ga4["property_id"]?.DeepClone(),
            ["summary"] = ga4["summary"]?.DeepClone() ?? new JsonObject(),
            ["top_pages"] = sliced["items"]?.DeepClone(),
            ["fetched_at"] = data["fetched_at"]?.DeepClone(),
        };
    }

    public static async Task<JsonObject> GetGscPageQuerySliceAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var url = JsonCoercion.AsString(args["url"])?.Trim() ?? "";
        if (url.Length == 0)
        {
            return new JsonObject { ["error"] = "url is required" };
        }

        var data = await scoped.LoadGoogleFullAsync(db, cancellationToken)
            ?? await scoped.LoadGoogleAsync(db, cancellationToken);
        if (data is null)
        {
            return new JsonObject { ["error"] = "no google data found" };
        }

        var sliceData = Insight.InsightLogic.SliceFromGoogleRow(data, url);
        return new JsonObject
        {
            ["url"] = url,
            ["gsc_ga4"] = sliceData,
        };
    }

    public static async Task<JsonObject> GetGscDailyTrendAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
        => await GoogleSeriesAsync(db, ctx, "gsc", "daily", cancellationToken);

    public static async Task<JsonObject> GetGa4DailyTrendAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
        => await GoogleSeriesAsync(db, ctx, "ga4", "daily", cancellationToken);

    public static async Task<JsonObject> GetGa4ByDeviceAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
        => await GoogleSeriesAsync(db, ctx, "ga4", "by_device", cancellationToken);

    public static async Task<JsonObject> GetGa4ByChannelAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
        => await GoogleSeriesAsync(db, ctx, "ga4", "by_channel", cancellationToken);

    public static async Task<JsonObject> GetGscPageQueriesAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var url = JsonCoercion.AsString(args["url"])?.Trim() ?? "";
        if (url.Length == 0)
        {
            return new JsonObject { ["error"] = "url is required" };
        }

        var raw = await scoped.LoadGoogleFullAsync(db, cancellationToken)
            ?? await scoped.LoadGoogleAsync(db, cancellationToken);
        if (raw is null)
        {
            return new JsonObject { ["error"] = "no google data found", ["missing"] = true };
        }

        var sliceData = Insight.InsightLogic.SliceFromGoogleRow(raw, url);
        var gsc = sliceData["gsc"] as JsonObject ?? [];
        var queries = gsc["queries"] as JsonArray ?? [];
        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 25, 50);
        var sliced = PayloadSliceHelpers.CapList(queries.ToList(), limit, 50);
        return new JsonObject
        {
            ["url"] = url,
            ["queries"] = sliced["items"]?.DeepClone(),
            ["total"] = sliced["total"]?.DeepClone(),
            ["truncated"] = sliced["truncated"]?.DeepClone(),
            ["provenance"] = "Search Console",
        };
    }

    public static async Task<JsonObject> GetGscCtrOpportunityPagesAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var data = await scoped.LoadGoogleAsync(db, cancellationToken);
        if (data is null)
        {
            return new JsonObject
            {
                ["error"] = "no google data found",
                ["pages"] = new JsonArray(),
                ["total"] = 0,
                ["truncated"] = false,
            };
        }

        var gsc = data["gsc"] as JsonObject ?? [];
        var pages = gsc["top_pages"] as JsonArray ?? [];
        var minImpressions = args["min_impressions"]?.GetValue<int?>() ?? 100;
        var opportunities = new List<JsonObject>();
        foreach (var node in pages)
        {
            if (node is not JsonObject row)
            {
                continue;
            }

            var impressions = row["impressions"]?.GetValue<int?>() ?? 0;
            if (impressions < minImpressions)
            {
                continue;
            }

            var pos = row["position"]?.GetValue<double?>() ?? 0;
            if (pos <= 0)
            {
                continue;
            }

            var ctrFrac = CtrAsFraction(row["ctr"]);
            var expected = IndustryCtr(pos);
            if (ctrFrac > 0 && ctrFrac < expected * 0.7)
            {
                opportunities.Add(new JsonObject
                {
                    ["page"] = row["page"]?.DeepClone() ?? row["url"]?.DeepClone(),
                    ["clicks"] = row["clicks"]?.DeepClone(),
                    ["impressions"] = impressions,
                    ["ctr"] = row["ctr"]?.DeepClone(),
                    ["position"] = pos,
                    ["expected_ctr_fraction"] = Math.Round(expected, 4),
                    ["opportunity"] = "improve CTR (title/description)",
                });
            }
        }

        opportunities.Sort((a, b) => (b["impressions"]?.GetValue<int?>() ?? 0).CompareTo(a["impressions"]?.GetValue<int?>() ?? 0));
        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 30, 50);
        var sliced = PayloadSliceHelpers.CapList(opportunities.Cast<JsonNode?>().ToList(), limit, 50);
        return new JsonObject
        {
            ["pages"] = sliced["items"]?.DeepClone(),
            ["total"] = sliced["total"]?.DeepClone(),
            ["truncated"] = sliced["truncated"]?.DeepClone(),
            ["provenance"] = "Search Console",
        };
    }

    private static double CtrAsFraction(JsonNode? ctr)
    {
        if (ctr is null)
        {
            return 0;
        }

        if (!double.TryParse(ctr.ToString(), out var value))
        {
            return 0;
        }

        return value > 1 ? value / 100.0 : value;
    }

    private static double IndustryCtr(double position)
    {
        var rank = (int)Math.Ceiling(position);
        rank = Math.Clamp(rank, 1, 10);
        return rank switch
        {
            1 => 0.278,
            2 => 0.153,
            3 => 0.103,
            4 => 0.073,
            5 => 0.053,
            6 => 0.040,
            7 => 0.031,
            8 => 0.025,
            9 => 0.021,
            10 => 0.018,
            _ => 0.008,
        };
    }

    private static async Task<JsonObject> ListGscSortedAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        string rowKey,
        string outputKey,
        string sortField,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var data = await scoped.LoadGoogleFullAsync(db, cancellationToken)
            ?? await scoped.LoadGoogleAsync(db, cancellationToken);
        if (data is null)
        {
            return new JsonObject
            {
                ["error"] = "no google data found",
                ["missing"] = true,
                [outputKey] = new JsonArray(),
                ["total"] = 0,
                ["truncated"] = false,
            };
        }

        var rows = GscRows(data, rowKey);
        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 30, 50);
        var sliced = SortGscRows(rows, sortField, limit);
        return new JsonObject
        {
            [outputKey] = sliced["items"]?.DeepClone(),
            ["total"] = sliced["total"]?.DeepClone(),
            ["truncated"] = sliced["truncated"]?.DeepClone(),
        };
    }

    public static List<JsonObject> GscRows(JsonObject data, string key)
    {
        var gsc = ResolveGscBlock(data);
        JsonArray? array = null;
        if (gsc[key] is JsonArray direct)
        {
            array = direct;
        }
        else if (gsc[$"top_{key}"] is JsonArray top)
        {
            array = top;
        }

        var rows = new List<JsonObject>();
        if (array is null)
        {
            return rows;
        }

        foreach (var node in array)
        {
            if (node is JsonObject row)
            {
                rows.Add(row);
            }
        }

        return rows;
    }

    private static JsonObject ResolveGscBlock(JsonObject data)
    {
        if (data["gsc_full"] is JsonObject full)
        {
            return full;
        }

        return data["gsc"] as JsonObject ?? [];
    }

    private static JsonObject SortGscRows(IReadOnlyList<JsonObject> rows, string sortField, int limit)
    {
        var sorted = rows
            .OrderByDescending(r => JsonCoercion.Num(r[sortField]))
            .Cast<JsonNode?>()
            .ToList();
        return PayloadSliceHelpers.CapList(sorted, limit, 50);
    }

    private static async Task<JsonObject> CapGoogleListAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        string section,
        string[] keys,
        string outputKey,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var data = await scoped.LoadGoogleAsync(db, cancellationToken);
        if (data is null)
        {
            return new JsonObject
            {
                ["error"] = "no google data found",
                [outputKey] = new JsonArray(),
                ["total"] = 0,
            };
        }

        var block = data[section] as JsonObject ?? [];
        JsonArray? source = null;
        foreach (var key in keys)
        {
            if (block[key] is JsonArray array)
            {
                source = array;
                break;
            }
        }

        source ??= [];
        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 30, 50);
        var sliced = PayloadSliceHelpers.CapList(source.ToList(), limit, 50);
        return new JsonObject
        {
            [outputKey] = sliced["items"]?.DeepClone(),
            ["total"] = sliced["total"]?.DeepClone(),
            ["truncated"] = sliced["truncated"]?.DeepClone(),
        };
    }

    private static async Task<JsonObject> GoogleSeriesAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        string section,
        string key,
        CancellationToken cancellationToken)
    {
        var data = await ctx.LoadGoogleAsync(db, cancellationToken);
        if (data is null)
        {
            return new JsonObject { ["error"] = "no google data found", ["missing"] = true };
        }

        var block = data[section] as JsonObject ?? [];
        var series = block[key] as JsonArray ?? [];
        return new JsonObject
        {
            [key] = series.DeepClone(),
            ["fetched_at"] = data["fetched_at"]?.DeepClone(),
            ["date_range"] = data["date_range"]?.DeepClone(),
            ["provenance"] = section == "gsc" ? "Search Console" : "Google Analytics 4",
        };
    }
}
