using System.Text.Json.Nodes;
using AiService.Tools.Context;
using AiService.Tools.Slice;
using Npgsql;

namespace AiService.Tools.Handlers.Insight;

/// <summary>
/// Stub insight tools returning payload slices until full GSC/GA4 blending is ported from Python
/// <c>website_profiling.tools.audit_tools.insight.insight_tools</c>.
/// </summary>
public static class InsightToolHandlers
{
    public static async Task<JsonObject> GetOpportunityMatrixAsync(
        NpgsqlConnection conn,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var payload = await scoped.LoadPayloadAsync(conn, cancellationToken);
        if (payload.Count == 0)
        {
            return new JsonObject
            {
                ["error"] = "no report found",
                ["missing"] = true,
            };
        }

        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 30, 100);
        var google = PayloadSliceHelpers.PayloadDictSlice(
            payload,
            "google",
            ["gsc", "ga4", "gsc_full", "ga4_full", "fetched_at"]);
        var topPages = PayloadSliceHelpers.PayloadField(payload, "top_pages", limit, maxCap: 100);

        return new JsonObject
        {
            ["stub"] = true,
            ["google"] = google,
            ["top_pages"] = topPages,
            ["property_id"] = scoped.PropertyId,
            ["report_id"] = scoped.ReportId,
        };
    }

    public static async Task<JsonObject> GetTrafficHealthCheckAsync(
        NpgsqlConnection conn,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var payload = await scoped.LoadPayloadAsync(conn, cancellationToken);
        if (payload.Count == 0)
        {
            return new JsonObject
            {
                ["error"] = "no report found",
                ["missing"] = true,
            };
        }

        var google = PayloadSliceHelpers.PayloadDictSlice(payload, "google");
        if (google["missing"]?.GetValue<bool>() == true)
        {
            return new JsonObject
            {
                ["error"] = "no google data found",
                ["missing"] = true,
            };
        }

        var data = google["data"] as JsonObject;
        var gsc = data?["gsc_full"] as JsonObject ?? data?["gsc"] as JsonObject;
        var ga4 = data?["ga4_full"] as JsonObject ?? data?["ga4"] as JsonObject;

        return new JsonObject
        {
            ["stub"] = true,
            ["gsc_summary"] = PayloadSliceHelpers.PayloadDictSlice(gsc ?? [], "summary"),
            ["ga4_summary"] = PayloadSliceHelpers.PayloadDictSlice(ga4 ?? [], "summary"),
            ["google"] = google,
            ["property_id"] = scoped.PropertyId,
            ["report_id"] = scoped.ReportId,
        };
    }
}
