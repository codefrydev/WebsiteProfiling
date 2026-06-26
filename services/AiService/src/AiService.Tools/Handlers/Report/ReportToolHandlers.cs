using System.Text.Json.Nodes;
using AiService.Tools.Context;

using AiService.Tools.Persistence;
namespace AiService.Tools.Handlers.Report;

/// <summary>
/// Report summary and issue query tools. Ports Python
/// <c>website_profiling.tools.audit_tools.report.report</c>.
/// </summary>
public static class ReportToolHandlers
{
    private static readonly Dictionary<string, int> PriorityOrder = new(StringComparer.Ordinal)
    {
        ["Critical"] = 0,
        ["High"] = 1,
        ["Medium"] = 2,
        ["Low"] = 3,
    };

    private static readonly Dictionary<string, string> LegacyCategoryDisplay = new(StringComparer.Ordinal)
    {
        ["HTML & Accessibility"] = "Accessibility & markup",
        ["HTML/Accessibility"] = "Accessibility & markup",
        ["Link Health"] = "Links",
        ["Mobile Optimization"] = "Mobile SEO",
        ["Content intelligence"] = "Content quality",
    };

    private const int IssueLimitDefault = 20;
    private const int IssueLimitMax = 50;

    public static async Task<JsonObject> GetReportSummaryAsync(
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

        var allIssues = IterCategoryIssues(payload);
        var summary = payload["summary"] as JsonObject ?? [];
        var categories = BuildCategorySummaries(payload);

        return new JsonObject
        {
            ["site_name"] = payload["site_name"]?.DeepClone(),
            ["report_generated_at"] = payload["report_generated_at"]?.DeepClone(),
            ["health_score"] = HealthScore(payload),
            ["issue_counts"] = IssueCounts(allIssues),
            ["total_issues"] = allIssues.Count,
            ["crawl_summary"] = new JsonObject
            {
                ["total_urls"] = summary["total_urls"]?.DeepClone(),
                ["count_2xx"] = summary["count_2xx"]?.DeepClone(),
                ["count_3xx"] = summary["count_3xx"]?.DeepClone(),
                ["count_4xx"] = summary["count_4xx"]?.DeepClone(),
                ["count_5xx"] = summary["count_5xx"]?.DeepClone(),
                ["success_rate"] = summary["success_rate"]?.DeepClone(),
            },
            ["categories"] = categories,
            ["property_id"] = scoped.PropertyId,
            ["report_id"] = scoped.ReportId,
        };
    }

    public static async Task<JsonObject> ListIssuesAsync(
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
                ["issues"] = new JsonArray(),
                ["total"] = 0,
                ["truncated"] = false,
            };
        }

        var limit = ParseIssueLimit(args);
        var priorityFilter = NormalizePriority(GetStringArg(args, "priority"));
        var categoryId = GetStringArg(args, "category_id");
        var urlContains = GetStringArg(args, "url_contains").ToLowerInvariant();

        var issues = IterCategoryIssues(payload);
        if (!string.IsNullOrEmpty(priorityFilter))
        {
            issues = issues.Where(i => string.Equals(i["priority"]?.GetValue<string>(), priorityFilter, StringComparison.Ordinal)).ToList();
        }

        if (!string.IsNullOrEmpty(categoryId))
        {
            issues = issues.Where(i => string.Equals(i["category_id"]?.GetValue<string>(), categoryId, StringComparison.Ordinal)).ToList();
        }

        if (!string.IsNullOrEmpty(urlContains))
        {
            issues = issues.Where(i => (i["url"]?.GetValue<string>() ?? string.Empty).ToLowerInvariant().Contains(urlContains, StringComparison.Ordinal)).ToList();
        }

        var sortMode = GetStringArg(args, "sort").ToLowerInvariant();
        if (sortMode == "impact")
        {
            issues = issues
                .OrderByDescending(i => i["impact_score"]?.GetValue<double?>() ?? 0)
                .ThenByDescending(i => i["gsc_clicks"]?.GetValue<double?>() ?? 0)
                .ToList();
        }

        var total = issues.Count;
        var truncated = total > limit;
        var page = new JsonArray();
        foreach (var issue in issues.Take(limit))
        {
            page.Add(issue);
        }

        return new JsonObject
        {
            ["issues"] = page,
            ["total"] = total,
            ["truncated"] = truncated,
        };
    }

    public static Task<JsonObject> GetCriticalIssuesAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var withPriority = args.DeepClone() as JsonObject ?? [];
        withPriority["priority"] = "Critical";
        return ListIssuesAsync(db, ctx, withPriority, cancellationToken);
    }

    public static Task<JsonObject> ListTopImpactIssuesAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var withSort = args.DeepClone() as JsonObject ?? [];
        withSort["sort"] = "impact";
        return ListIssuesAsync(db, ctx, withSort, cancellationToken);
    }

    public static List<JsonObject> IterCategoryIssuesPublic(JsonObject payload) => IterCategoryIssues(payload);

    public static string CategoryDisplayNamePublic(string name) => CategoryDisplayName(name);

    public static async Task<JsonObject> GetCategoryScoresAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var payload = await scoped.LoadPayloadAsync(db, cancellationToken);
        if (payload.Count == 0)
        {
            return new JsonObject { ["error"] = "no report found", ["categories"] = new JsonArray() };
        }

        return new JsonObject
        {
            ["categories"] = BuildCategorySummaries(payload),
            ["health_score"] = HealthScore(payload),
        };
    }

    public static async Task<JsonObject> GetExecutiveSummaryAsync(
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

        if (payload["executive_summary"] is null)
        {
            return new JsonObject
            {
                ["error"] = "executive_summary not generated — enable AI in audit settings",
                ["missing"] = true,
            };
        }

        return new JsonObject { ["executive_summary"] = payload["executive_summary"].DeepClone() };
    }

    public static async Task<JsonObject> GetReportMetaAsync(
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

        if (payload["report_meta"] is not JsonObject meta)
        {
            return new JsonObject { ["error"] = "report_meta not in payload", ["missing"] = true };
        }

        return new JsonObject { ["report_meta"] = meta.DeepClone() };
    }

    public static async Task<JsonObject> GetSiteLevelAsync(
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

        if (payload["site_level"] is not JsonObject siteLevel)
        {
            return new JsonObject { ["error"] = "site_level not in payload", ["missing"] = true };
        }

        return new JsonObject { ["site_level"] = siteLevel.DeepClone() };
    }

    private static List<JsonObject> IterCategoryIssues(JsonObject payload)
    {
        var rows = new List<JsonObject>();
        if (payload["categories"] is not JsonArray categories)
        {
            return rows;
        }

        foreach (var catNode in categories)
        {
            if (catNode is not JsonObject cat)
            {
                continue;
            }

            var catId = cat["id"]?.GetValue<string>() ?? string.Empty;
            var catName = CategoryDisplayName(cat["name"]?.GetValue<string>() ?? catId);
            if (cat["issues"] is not JsonArray issueList)
            {
                continue;
            }

            foreach (var issueNode in issueList)
            {
                if (issueNode is not JsonObject issue)
                {
                    continue;
                }

                var rec = issue["llm_recommendation"]?.GetValue<string>()
                    ?? issue["recommendation"]?.GetValue<string>()
                    ?? string.Empty;
                var row = new JsonObject
                {
                    ["category_id"] = catId,
                    ["category"] = catName,
                    ["priority"] = issue["priority"]?.GetValue<string>() ?? "Medium",
                    ["message"] = issue["message"]?.GetValue<string>() ?? string.Empty,
                    ["url"] = issue["url"]?.GetValue<string>() ?? string.Empty,
                    ["recommendation"] = rec,
                };

                foreach (var key in new[] { "impact_score", "gsc_clicks", "gsc_impressions", "ga4_sessions" })
                {
                    if (issue.TryGetPropertyValue(key, out var value) && value is not null)
                    {
                        row[key] = value.DeepClone();
                    }
                }

                rows.Add(row);
            }
        }

        rows.Sort((a, b) =>
        {
            var pa = PriorityOrder.GetValueOrDefault(a["priority"]?.GetValue<string>() ?? "Low", 99);
            var pb = PriorityOrder.GetValueOrDefault(b["priority"]?.GetValue<string>() ?? "Low", 99);
            return pa.CompareTo(pb);
        });

        return rows;
    }

    private static JsonArray BuildCategorySummaries(JsonObject payload)
    {
        var categories = new JsonArray();
        if (payload["categories"] is not JsonArray source)
        {
            return categories;
        }

        foreach (var catNode in source)
        {
            if (catNode is not JsonObject cat)
            {
                continue;
            }

            var issueCount = cat["issues"] is JsonArray issues ? issues.Count : 0;
            categories.Add(new JsonObject
            {
                ["id"] = cat["id"]?.DeepClone(),
                ["name"] = CategoryDisplayName(cat["name"]?.GetValue<string>() ?? string.Empty),
                ["score"] = cat["score"]?.DeepClone(),
                ["issue_count"] = issueCount,
            });
        }

        return categories;
    }

    private static JsonObject IssueCounts(IReadOnlyList<JsonObject> issues)
    {
        var counts = new JsonObject
        {
            ["Critical"] = 0,
            ["High"] = 0,
            ["Medium"] = 0,
            ["Low"] = 0,
        };

        foreach (var issue in issues)
        {
            var priority = issue["priority"]?.GetValue<string>() ?? "Medium";
            if (counts.TryGetPropertyValue(priority, out var current) && current is JsonValue value && value.TryGetValue(out int count))
            {
                counts[priority] = count + 1;
            }
        }

        return counts;
    }

    private static int? HealthScore(JsonObject payload)
    {
        if (payload["categories"] is not JsonArray categories)
        {
            return null;
        }

        var scores = new List<double>();
        foreach (var catNode in categories)
        {
            if (catNode is not JsonObject cat)
            {
                continue;
            }

            if (cat["score"] is JsonValue scoreValue && scoreValue.TryGetValue(out double score))
            {
                scores.Add(score);
            }
        }

        if (scores.Count == 0)
        {
            return null;
        }

        return (int)Math.Round(scores.Average(), MidpointRounding.AwayFromZero);
    }

    private static string CategoryDisplayName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return string.Empty;
        }

        return LegacyCategoryDisplay.GetValueOrDefault(name, name);
    }

    private static string NormalizePriority(string raw)
    {
        var trimmed = raw.Trim();
        if (string.IsNullOrEmpty(trimmed))
        {
            return string.Empty;
        }

        var cap = char.ToUpperInvariant(trimmed[0]) + trimmed[1..].ToLowerInvariant();
        return PriorityOrder.ContainsKey(cap) ? cap : trimmed;
    }

    private static int ParseIssueLimit(JsonObject args)
    {
        if (args.TryGetPropertyValue("limit", out var limitNode) && limitNode is JsonValue value && value.TryGetValue(out int limit))
        {
            return Math.Max(1, Math.Min(limit, IssueLimitMax));
        }

        if (int.TryParse(limitNode?.ToString(), out var parsed))
        {
            return Math.Max(1, Math.Min(parsed, IssueLimitMax));
        }

        return IssueLimitDefault;
    }

    private static string GetStringArg(JsonObject args, string key)
        => args.TryGetPropertyValue(key, out var node) ? node?.GetValue<string>() ?? string.Empty : string.Empty;
}
