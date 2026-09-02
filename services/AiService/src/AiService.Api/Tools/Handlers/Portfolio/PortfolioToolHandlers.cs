using System.Text.Json;
using System.Text.Json.Nodes;
using AiService.Api.Tools.Context;
using AiService.Api.Tools.Handlers.Report;
using AiService.Api.Tools.Persistence;
using AiService.Api.Tools.Slice;
using Microsoft.EntityFrameworkCore;

namespace AiService.Api.Tools.Handlers.Portfolio;

/// <summary>Portfolio and chart aggregate tools — ports Python portfolio modules.</summary>
public static class PortfolioToolHandlers
{
    public static async Task<JsonObject> GetPortfolioSummaryAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 50, 100);
        var properties = await db.Properties.AsNoTracking()
            .OrderBy(x => x.Id)
            .Take(limit)
            .Select(x => new { x.Id, x.Name, x.CanonicalDomain })
            .ToListAsync(cancellationToken);

        var enriched = new JsonArray();
        var scores = new List<double>();
        foreach (var prop in properties)
        {
            var snap = await db.AuditHealthSnapshots.AsNoTracking()
                .Where(x => x.PropertyId == prop.Id)
                .OrderByDescending(x => x.GeneratedAt)
                .ThenByDescending(x => x.Id)
                .Select(x => new { x.HealthScore, x.GeneratedAt, x.ReportId, x.IssueCounts })
                .FirstOrDefaultAsync(cancellationToken);

            double? healthScore = snap?.HealthScore;
            if (healthScore is not null)
            {
                scores.Add(healthScore.Value);
            }

            JsonNode? issueCounts = null;
            if (!string.IsNullOrWhiteSpace(snap?.IssueCounts))
            {
                try
                {
                    issueCounts = JsonNode.Parse(snap.IssueCounts);
                }
                catch (JsonException ex)
                {
                    ctx.Logger?.LogDebug(ex, "Malformed JSON in portfolio issue_counts snapshot");
                }
            }

            enriched.Add(new JsonObject
            {
                ["property_id"] = (int)prop.Id,
                ["name"] = prop.Name,
                ["canonical_domain"] = prop.CanonicalDomain,
                ["health_score"] = healthScore,
                ["generated_at"] = snap?.GeneratedAt.ToString("O") ?? "",
                ["report_id"] = snap?.ReportId,
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

        return new JsonObject
        {
            ["summary"] = payload["summary"]?.DeepClone(),
            ["crawl_run_id"] = payload["crawl_run_id"]?.DeepClone(),
            ["crawl_run_created_at"] = payload["crawl_run_created_at"]?.DeepClone(),
            ["report_generated_at"] = payload["report_generated_at"]?.DeepClone(),
        };
    }

    public static async Task<JsonObject> GetMimeTypeBreakdownAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
        => await LabelValuePairAsync(db, ctx, args, "mime_labels", "mime_values", cancellationToken);

    public static async Task<JsonObject> GetTitleLengthDistributionAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
        => await LabelValuePairAsync(db, ctx, args, "title_labels", "title_counts", cancellationToken);

    public static async Task<JsonObject> GetDomainLinkDistributionAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
        => await LabelValuePairAsync(db, ctx, args, "domain_labels", "domain_values", cancellationToken);

    public static async Task<JsonObject> GetOutlinkDistributionAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
        => await LabelValuePairAsync(db, ctx, args, "outlink_labels", "outlink_counts", cancellationToken);

    public static async Task<JsonObject> GetIssuePriorityBreakdownAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var summary = await ReportToolHandlers.GetReportSummaryAsync(db, ctx, args, cancellationToken);
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
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var payload = await scoped.LoadPayloadAsync(db, cancellationToken);
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
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        string labelsKey,
        string valuesKey,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var payload = await scoped.LoadPayloadAsync(db, cancellationToken);
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
