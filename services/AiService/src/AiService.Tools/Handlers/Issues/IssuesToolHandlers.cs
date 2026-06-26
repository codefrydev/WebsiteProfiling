using System.Text.Json.Nodes;
using AiService.Tools.Context;
using AiService.Tools.Handlers.Report;
using Npgsql;
using WebsiteProfiling.Contracts.Json;

namespace AiService.Tools.Handlers.Issues;

/// <summary>Category-scoped issue tools — ports Python <c>issues/issues.py</c>.</summary>
public static class IssuesToolHandlers
{
    public static async Task<JsonObject> GetCategoryIssuesAsync(
        NpgsqlConnection conn,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var categoryId = JsonCoercion.AsString(args["category_id"])?.Trim() ?? "";
        if (categoryId.Length == 0)
        {
            return new JsonObject { ["error"] = "category_id is required" };
        }

        var payload = await scoped.LoadPayloadAsync(conn, cancellationToken);
        if (payload.Count == 0)
        {
            return new JsonObject { ["error"] = "no report found" };
        }

        if (payload["categories"] is not JsonArray categories)
        {
            return new JsonObject
            {
                ["error"] = $"category {categoryId} not found",
                ["category_id"] = categoryId,
            };
        }

        foreach (var catNode in categories)
        {
            if (catNode is not JsonObject cat)
            {
                continue;
            }

            if (!string.Equals(cat["id"]?.GetValue<string>(), categoryId, StringComparison.Ordinal))
            {
                continue;
            }

            var singlePayload = new JsonObject { ["categories"] = new JsonArray(cat.DeepClone()) };
            var issues = ReportToolHandlers.IterCategoryIssuesPublic(singlePayload);
            var issueArray = new JsonArray();
            foreach (var issue in issues)
            {
                issueArray.Add(issue);
            }

            return new JsonObject
            {
                ["category_id"] = categoryId,
                ["name"] = ReportToolHandlers.CategoryDisplayNamePublic(cat["name"]?.GetValue<string>() ?? categoryId),
                ["score"] = cat["score"]?.DeepClone(),
                ["issues"] = issueArray,
                ["issue_count"] = issues.Count,
            };
        }

        return new JsonObject
        {
            ["error"] = $"category {categoryId} not found",
            ["category_id"] = categoryId,
        };
    }

    public static Task<JsonObject> ListIssuesByCategoryAsync(
        NpgsqlConnection conn,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var categoryId = JsonCoercion.AsString(args["category_id"])?.Trim() ?? "";
        if (categoryId.Length == 0)
        {
            return Task.FromResult(new JsonObject { ["error"] = "category_id is required" });
        }

        var withCategory = args.DeepClone() as JsonObject ?? [];
        withCategory["category_id"] = categoryId;
        return ReportToolHandlers.ListIssuesAsync(conn, ctx, withCategory, cancellationToken);
    }
}
