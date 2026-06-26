using System.Text.Json.Nodes;
using AiService.Application.Services;
using AiService.Application.Repositories;
using AiService.Domain.Repositories;
using AiService.Providers.Chat;
using AiService.Tools.Context;
using AiService.Tools.Handlers.Geo;
using AiService.Tools.Handlers.Insight;
using AiService.Tools.Handlers.Issues;
using AiService.Tools.Handlers.Report;
using AiService.Tools.Handlers.Core;
using AiService.Tools.Registry;
using AiService.Tools.Slice;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using WebsiteProfiling.Contracts.Json;

namespace AiService.Application.Handlers;

/// <summary>LLM-powered audit tools — ports Python <c>integrations/llm_tools.py</c>.</summary>
public static class LlmToolHandlers
{
    public static IEnumerable<IToolHandler> AllHandlers(IServiceProvider serviceProvider)
    {
        yield return new InjectingToolHandler(
            "generate_issue_fix",
            GenerateIssueFixAsync,
            serviceProvider);
        yield return new InjectingToolHandler(
            "get_page_coach",
            GetPageCoachAsync,
            serviceProvider);
        yield return new DelegatingToolHandler(
            "generate_content_brief",
            GenerateContentBriefAsync);
        yield return new InjectingToolHandler(
            "summarize_category_for_client",
            SummarizeCategoryForClientAsync,
            serviceProvider);
        yield return new InjectingToolHandler(
            "analyze_serp_snippet_for_url",
            AnalyzeSerpSnippetForUrlAsync,
            serviceProvider);
        yield return new InjectingToolHandler(
            "draft_llms_txt",
            DraftLlmsTxtAsync,
            serviceProvider);
        yield return new DelegatingToolHandler(
            "generate_schema",
            GeoGenerationToolHandlers.GenerateSchemaAsync);
        yield return new DelegatingToolHandler(
            "generate_robots_txt",
            GeoGenerationToolHandlers.GenerateRobotsTxtAsync);
        yield return new DelegatingToolHandler(
            "generate_meta_tags",
            GeoGenerationToolHandlers.GenerateMetaTagsAsync);
        yield return new DelegatingToolHandler(
            "generate_geo_fix_bundle",
            GeoGenerationToolHandlers.GenerateGeoFixBundleAsync);
    }

    public static async Task<JsonObject> PrioritizeFixRoadmapAsync(
        NpgsqlConnection conn,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var withSort = args.DeepClone() as JsonObject ?? [];
        withSort["sort"] = "impact";
        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 15, 30);
        var result = await ReportToolHandlers.ListIssuesAsync(conn, ctx, withSort, cancellationToken);
        if (result.TryGetPropertyValue("error", out _))
        {
            return new JsonObject { ["error"] = result["error"]?.DeepClone(), ["roadmap"] = new JsonArray() };
        }

        var roadmap = new JsonArray();
        if (result["issues"] is JsonArray issues)
        {
            var rank = 1;
            foreach (var node in issues.Take(limit))
            {
                if (node is not JsonObject issue)
                {
                    continue;
                }

                roadmap.Add(new JsonObject
                {
                    ["rank"] = rank++,
                    ["priority"] = issue["priority"]?.DeepClone(),
                    ["impact_score"] = issue["impact_score"]?.DeepClone(),
                    ["message"] = issue["message"]?.DeepClone(),
                    ["url"] = issue["url"]?.DeepClone(),
                    ["category"] = issue["category"]?.DeepClone(),
                    ["gsc_clicks"] = issue["gsc_clicks"]?.DeepClone(),
                    ["ga4_sessions"] = issue["ga4_sessions"]?.DeepClone(),
                });
            }
        }

        return new JsonObject
        {
            ["roadmap"] = roadmap,
            ["total_issues"] = result["total"]?.DeepClone(),
            ["provenance"] = "Crawl",
        };
    }

    private static async Task<JsonObject> GenerateIssueFixAsync(
        IServiceProvider services,
        NpgsqlConnection conn,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        _ = conn;
        _ = ctx;
        var message = JsonCoercion.AsString(args["message"])?.Trim() ?? "";
        if (message.Length == 0)
        {
            return new JsonObject { ["error"] = "message is required (issue message to fix)" };
        }

        await using var scope = services.CreateAsyncScope();
        var fixService = scope.ServiceProvider.GetRequiredService<FixSuggestionService>();
        var payload = new JsonObject
        {
            ["message"] = message,
            ["url"] = args["url"]?.DeepClone(),
            ["priority"] = args["priority"]?.DeepClone(),
            ["category"] = args["category_id"]?.DeepClone() ?? args["category"]?.DeepClone(),
            ["recommendation"] = args["recommendation"]?.DeepClone(),
            ["source"] = "issue",
        };
        var refresh = args["refresh"]?.GetValue<bool?>() == true
            || string.Equals(JsonCoercion.AsString(args["refresh"]), "true", StringComparison.OrdinalIgnoreCase);
        var result = await fixService.GenerateAsync(payload, refresh, cancellationToken);
        result["provenance"] = "AI insights";
        return result;
    }

    private static async Task<JsonObject> GetPageCoachAsync(
        IServiceProvider services,
        NpgsqlConnection conn,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        _ = conn;
        var url = JsonCoercion.AsString(args["url"])?.Trim() ?? "";
        if (url.Length == 0)
        {
            return new JsonObject { ["error"] = "url is required" };
        }

        await using var scope = services.CreateAsyncScope();
        var coach = scope.ServiceProvider.GetRequiredService<PageCoachService>();
        var refresh = args["refresh"]?.GetValue<bool?>() == true
            || string.Equals(JsonCoercion.AsString(args["refresh"]), "true", StringComparison.OrdinalIgnoreCase);
        return await coach.RunAsync(url, refresh, cancellationToken);
    }

    private static async Task<JsonObject> GenerateContentBriefAsync(
        NpgsqlConnection conn,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var keyword = JsonCoercion.AsString(args["keyword"])?.Trim() ?? "";
        if (keyword.Length == 0)
        {
            return new JsonObject { ["error"] = "keyword is required" };
        }

        var rows = new List<JsonObject>();
        if (scoped.PropertyId is not null)
        {
            var kwData = await scoped.LoadKeywordsAsync(conn, cancellationToken);
            if (kwData?["rows"] is JsonArray allRows)
            {
                var needle = keyword.ToLowerInvariant();
                foreach (var node in allRows)
                {
                    if (node is JsonObject row
                        && (JsonCoercion.AsString(row["keyword"]) ?? JsonCoercion.AsString(row["query"]) ?? "")
                            .Contains(needle, StringComparison.OrdinalIgnoreCase))
                    {
                        rows.Add(row);
                    }
                }
            }
        }

        var bullets = new JsonArray();
        if (args["gaps"] is JsonArray gaps)
        {
            foreach (var g in gaps.Take(8))
            {
                bullets.Add($"Gap: {g}");
            }
        }

        foreach (var row in rows.Take(5))
        {
            var kw = JsonCoercion.AsString(row["keyword"]) ?? JsonCoercion.AsString(row["query"]);
            var clicks = row["clicks"];
            if (string.IsNullOrWhiteSpace(kw))
            {
                continue;
            }

            bullets.Add(clicks is null
                ? $"Target cluster around '{kw}'"
                : $"Target cluster around '{kw}' ({clicks} clicks)");
        }

        if (bullets.Count == 0)
        {
            bullets.Add($"Create comprehensive content targeting '{keyword}'");
        }

        return new JsonObject
        {
            ["brief"] = new JsonObject
            {
                ["keyword"] = keyword,
                ["summary"] = bullets,
                ["provenance"] = "Estimated",
                ["use_llm"] = false,
            },
            ["keyword"] = keyword,
            ["matched_rows"] = rows.Count,
        };
    }

    private static async Task<JsonObject> SummarizeCategoryForClientAsync(
        IServiceProvider services,
        NpgsqlConnection conn,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var data = await IssuesToolHandlers.GetCategoryIssuesAsync(conn, ctx, args, cancellationToken);
        if (data.TryGetPropertyValue("error", out _))
        {
            return data;
        }

        var issues = data["issues"] as JsonArray ?? [];
        var topBullets = new JsonArray();
        foreach (var node in issues.Take(5))
        {
            if (node is not JsonObject issue)
            {
                continue;
            }

            var priority = JsonCoercion.AsString(issue["priority"]) ?? "";
            var message = JsonCoercion.AsString(issue["message"]) ?? "";
            var url = JsonCoercion.AsString(issue["url"]);
            var line = $"[{priority}] {message}" + (string.IsNullOrWhiteSpace(url) ? "" : $" ({url})");
            topBullets.Add(line);
        }

        var categoryId = JsonCoercion.AsString(data["category_id"]) ?? "";
        var summary = new JsonObject
        {
            ["category_id"] = categoryId,
            ["category_name"] = data["name"]?.DeepClone(),
            ["score"] = data["score"]?.DeepClone(),
            ["issue_count"] = issues.Count,
            ["headline"] = $"{data["name"] ?? categoryId}: {issues.Count} issue(s), score {data["score"]}",
            ["top_issues"] = topBullets,
        };

        await using var scope = services.CreateAsyncScope();
        var configRepo = scope.ServiceProvider.GetRequiredService<ILlmSettingsRepository>();
        var completion = scope.ServiceProvider.GetRequiredService<StructuredCompletionService>();
        var cfg = await configRepo.LoadAsync(cancellationToken);
        if (LlmConfigHelpers.IsEnabled(cfg))
        {
            try
            {
                var user =
                    "Write a 2-3 sentence client-friendly summary of this audit category. "
                    + $"Return JSON with key summary. Data: {Truncate(summary.ToJsonString(), 3000)}";
                var raw = await completion.CompleteJsonAsync(
                    "You are a technical SEO consultant writing for clients.",
                    user,
                    cfg,
                    cancellationToken);
                if (JsonCoercion.AsString(raw["summary"]) is { Length: > 0 } narrative)
                {
                    summary["narrative"] = narrative;
                }
            }
            catch (Exception ex)
            {
                summary["narrative_error"] = ex.Message;
            }
        }

        summary["provenance"] = summary.ContainsKey("narrative") ? "AI insights" : "Crawl";
        return summary;
    }

    private static async Task<JsonObject> AnalyzeSerpSnippetForUrlAsync(
        IServiceProvider services,
        NpgsqlConnection conn,
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

        var google = await scoped.LoadGoogleAsync(conn, cancellationToken);
        var gscSlice = google is not null ? InsightLogic.SliceFromGoogleRow(google, url) : new JsonObject();
        var gscPage = gscSlice["gsc"] as JsonObject;
        var rows = await scoped.LoadCrawlDfAsync(conn, cancellationToken);
        JsonObject? pageRow = null;
        var needle = url.TrimEnd('/').ToLowerInvariant();
        foreach (var row in rows)
        {
            if ((JsonCoercion.AsString(row["url"]) ?? "").TrimEnd('/').ToLowerInvariant() == needle)
            {
                pageRow = row;
                break;
            }
        }

        var baseResult = new JsonObject
        {
            ["url"] = url,
            ["current_title"] = pageRow?["title"]?.DeepClone(),
            ["current_meta_description"] = pageRow?["meta_description"]?.DeepClone(),
            ["gsc_queries"] = gscPage?["queries"]?.DeepClone(),
            ["gsc_metrics"] = gscPage?["page_metrics"]?.DeepClone(),
        };

        await using var scope = services.CreateAsyncScope();
        var configRepo = scope.ServiceProvider.GetRequiredService<ILlmSettingsRepository>();
        var completion = scope.ServiceProvider.GetRequiredService<StructuredCompletionService>();
        var cfg = await configRepo.LoadAsync(cancellationToken);
        if (!LlmConfigHelpers.IsEnabled(cfg))
        {
            baseResult["note"] = "AI insights are disabled — enable LLM in audit settings";
            baseResult["provenance"] = "Crawl";
            return baseResult;
        }

        try
        {
            var prompt =
                "Suggest improved title and meta description for better CTR. "
                + $"Context: {Truncate(baseResult.ToJsonString(), 2500)}";
            var suggestions = await completion.CompleteJsonAsync(
                "You are an SEO copywriter. Return JSON with title, meta_description, rationale.",
                prompt,
                cfg,
                cancellationToken);
            baseResult["suggestions"] = suggestions;
            baseResult["provenance"] = "AI insights";
        }
        catch (Exception ex)
        {
            baseResult["error"] = ex.Message;
            baseResult["provenance"] = "Crawl";
        }

        return baseResult;
    }

    private static async Task<JsonObject> DraftLlmsTxtAsync(
        IServiceProvider services,
        NpgsqlConnection conn,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var draft = await GeoGenerationToolHandlers.DraftLlmsTxtAsync(conn, ctx, args, cancellationToken);
        if (draft.TryGetPropertyValue("error", out _))
        {
            return draft;
        }

        await using var scope = services.CreateAsyncScope();
        var configRepo = scope.ServiceProvider.GetRequiredService<ILlmSettingsRepository>();
        var completion = scope.ServiceProvider.GetRequiredService<StructuredCompletionService>();
        var cfg = await configRepo.LoadAsync(cancellationToken);
        if (!LlmConfigHelpers.IsEnabled(cfg))
        {
            return draft;
        }

        var draftText = JsonCoercion.AsString(draft["llms_txt_draft"]) ?? "";
        try
        {
            var raw = await completion.CompleteJsonAsync(
                "You write concise llms.txt files per emerging conventions. Return JSON with key content.",
                "Polish this llms.txt draft:\n" + draftText,
                cfg,
                cancellationToken);
            var content = JsonCoercion.AsString(raw["content"]);
            if (!string.IsNullOrWhiteSpace(content))
            {
                draft["llms_txt_draft"] = content;
            }
        }
        catch
        {
            // keep heuristic draft
        }

        return draft;
    }

    private static string Truncate(string text, int max)
        => text.Length <= max ? text : text[..max];
}
