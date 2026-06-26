using System.Text.Json.Nodes;
using AiService.Tools.Context;
using AiService.Tools.Handlers.Report;
using AiService.Tools.Slice;
using Npgsql;
using WebsiteProfiling.Contracts.Json;

namespace AiService.Tools.Handlers.Portfolio;

/// <summary>Portfolio and chart aggregate tools — ports Python portfolio modules.</summary>
public static class PortfolioToolHandlers
{
    public static async Task<JsonObject> GetPortfolioSummaryAsync(
        NpgsqlConnection conn,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        _ = ctx;
        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 50, 100);
        var summaries = new JsonArray();

        await using (var propsCmd = conn.CreateCommand())
        {
            propsCmd.CommandText =
                "SELECT id, name, canonical_domain FROM properties ORDER BY id ASC";
            await using var reader = await propsCmd.ExecuteReaderAsync(cancellationToken);
            var count = 0;
            while (await reader.ReadAsync(cancellationToken) && count < limit)
            {
                if (reader.IsDBNull(0))
                {
                    continue;
                }

                var pid = reader.GetInt32(0);
                var name = reader.IsDBNull(1) ? null : reader.GetString(1);
                var domain = reader.IsDBNull(2) ? null : reader.GetString(2);
                summaries.Add(new JsonObject
                {
                    ["property_id"] = pid,
                    ["name"] = name,
                    ["canonical_domain"] = domain,
                });
                count++;
            }
        }

        var enriched = new JsonArray();
        var scores = new List<double>();
        foreach (var node in summaries)
        {
            if (node is not JsonObject prop || prop["property_id"] is not JsonValue pidValue || !pidValue.TryGetValue(out int pid))
            {
                continue;
            }

            await using var snapCmd = conn.CreateCommand();
            snapCmd.CommandText =
                """
                SELECT health_score, generated_at, report_id, issue_counts
                FROM audit_health_snapshots
                WHERE property_id = @pid
                ORDER BY generated_at DESC, id DESC
                LIMIT 1
                """;
            snapCmd.Parameters.AddWithValue("pid", pid);
            await using var snapReader = await snapCmd.ExecuteReaderAsync(cancellationToken);
            double? healthScore = null;
            string generatedAt = "";
            int? reportId = null;
            JsonNode? issueCounts = null;
            if (await snapReader.ReadAsync(cancellationToken))
            {
                if (!snapReader.IsDBNull(0))
                {
                    healthScore = Convert.ToDouble(snapReader.GetValue(0));
                    scores.Add(healthScore.Value);
                }

                if (!snapReader.IsDBNull(1))
                {
                    generatedAt = snapReader.GetDateTime(1).ToString("O");
                }

                if (!snapReader.IsDBNull(2))
                {
                    reportId = snapReader.GetInt32(2);
                }

                if (!snapReader.IsDBNull(3))
                {
                    var raw = snapReader.GetString(3);
                    if (!string.IsNullOrWhiteSpace(raw))
                    {
                        try
                        {
                            issueCounts = JsonNode.Parse(raw);
                        }
                        catch (System.Text.Json.JsonException)
                        {
                            issueCounts = new JsonObject();
                        }
                    }
                }
            }

            enriched.Add(new JsonObject
            {
                ["property_id"] = pid,
                ["name"] = prop["name"]?.DeepClone(),
                ["canonical_domain"] = prop["canonical_domain"]?.DeepClone(),
                ["health_score"] = healthScore,
                ["report_id"] = reportId,
                ["generated_at"] = generatedAt,
                ["issue_counts"] = issueCounts?.DeepClone(),
            });
        }

        double? median = null;
        if (scores.Count > 0)
        {
            var ordered = scores.OrderBy(x => x).ToList();
            var mid = ordered.Count / 2;
            median = ordered.Count % 2 == 0
                ? (ordered[mid - 1] + ordered[mid]) / 2
                : ordered[mid];
        }

        return new JsonObject
        {
            ["properties"] = enriched,
            ["count"] = enriched.Count,
            ["median_health_score"] = median,
        };
    }

    public static async Task<JsonObject> GetCrawlSummaryAsync(
        NpgsqlConnection conn,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var payload = await scoped.LoadPayloadAsync(conn, cancellationToken);
        if (payload.Count == 0)
        {
            return new JsonObject { ["error"] = "no report found" };
        }

        return new JsonObject
        {
            ["summary"] = payload["summary"]?.DeepClone(),
            ["crawl_run_id"] = payload["crawl_run_id"]?.DeepClone(),
            ["crawl_run_created_at"] = payload["crawl_run_created_at"]?.DeepClone(),
            ["report_generated_at"] = payload["report_generated_at"]?.DeepClone(),
        };
    }

    public static async Task<JsonObject> GetMimeTypeBreakdownAsync(
        NpgsqlConnection conn,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
        => await LabelValuePairAsync(conn, ctx, args, "mime_labels", "mime_values", cancellationToken);

    public static async Task<JsonObject> GetTitleLengthDistributionAsync(
        NpgsqlConnection conn,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
        => await LabelValuePairAsync(conn, ctx, args, "title_labels", "title_counts", cancellationToken);

    public static async Task<JsonObject> GetDomainLinkDistributionAsync(
        NpgsqlConnection conn,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
        => await LabelValuePairAsync(conn, ctx, args, "domain_labels", "domain_values", cancellationToken);

    public static async Task<JsonObject> GetOutlinkDistributionAsync(
        NpgsqlConnection conn,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
        => await LabelValuePairAsync(conn, ctx, args, "outlink_labels", "outlink_counts", cancellationToken);

    public static async Task<JsonObject> GetIssuePriorityBreakdownAsync(
        NpgsqlConnection conn,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var summary = await ReportToolHandlers.GetReportSummaryAsync(conn, ctx, args, cancellationToken);
        if (summary.TryGetPropertyValue("error", out _))
        {
            return summary;
        }

        var counts = summary["issue_counts"] as JsonObject ?? [];
        var items = new JsonArray();
        foreach (var label in new[] { "Critical", "High", "Medium", "Low" })
        {
            if (counts[label] is JsonValue value && value.TryGetValue(out int count) && count > 0)
            {
                items.Add(new JsonObject { ["label"] = label, ["value"] = count });
            }
        }

        return new JsonObject
        {
            ["items"] = items,
            ["total_issues"] = summary["total_issues"]?.DeepClone(),
            ["health_score"] = summary["health_score"]?.DeepClone(),
        };
    }

    public static async Task<JsonObject> GetTopCrawledPagesAsync(
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
                ["pages"] = new JsonArray(),
                ["total"] = 0,
                ["truncated"] = false,
            };
        }

        var top = payload["top_pages"] as JsonArray ?? [];
        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 20, 50);
        var sliced = PayloadSliceHelpers.CapList(top.ToList(), limit, 50);
        return new JsonObject
        {
            ["pages"] = sliced["items"]?.DeepClone(),
            ["total"] = sliced["total"]?.DeepClone(),
            ["truncated"] = sliced["truncated"]?.DeepClone(),
        };
    }

    private static async Task<JsonObject> LabelValuePairAsync(
        NpgsqlConnection conn,
        AuditToolContext ctx,
        JsonObject args,
        string labelsKey,
        string valuesKey,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var payload = await scoped.LoadPayloadAsync(conn, cancellationToken);
        if (payload.Count == 0)
        {
            return new JsonObject { ["error"] = "no report found" };
        }

        var labels = payload[labelsKey] as JsonArray ?? [];
        var values = payload[valuesKey] as JsonArray ?? [];
        var items = new JsonArray();
        for (var i = 0; i < labels.Count; i++)
        {
            items.Add(new JsonObject
            {
                ["label"] = labels[i]?.DeepClone(),
                ["value"] = i < values.Count ? values[i]?.DeepClone() : null,
            });
        }

        return new JsonObject { ["items"] = items };
    }
}
