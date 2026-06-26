using System.Text.Json.Nodes;
using AiService.Tools.Context;
using AiService.Tools.Domain;
using AiService.Tools.Registry;
using AiService.Tools.Selection;
using AiService.Tools.Slice;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using WebsiteProfiling.Contracts.Json;

namespace AiService.Tools.Handlers.Core;

/// <summary>Tier-0 workflow orchestrators — ports Python <c>core/router_tools.py</c>.</summary>
public static class WorkflowToolHandlers
{
    public static async Task<JsonObject> RunInsightWorkflowAsync(
        IServiceProvider services,
        NpgsqlConnection conn,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var wfType = (JsonCoercion.AsString(args["type"]) ?? "priorities").Trim().ToLowerInvariant();
        var baseArgs = BuildBaseArgs(scoped);
        var limit = args["limit"];

        List<(string Tool, JsonObject ToolArgs)> plan;
        if (wfType is "traffic" or "health")
        {
            plan = [("get_traffic_health_check", baseArgs)];
        }
        else if (wfType is "landing_pages" or "landing")
        {
            var withLimit = baseArgs.DeepClone() as JsonObject ?? [];
            if (limit is not null)
            {
                withLimit["limit"] = limit.DeepClone();
            }
            else
            {
                withLimit["limit"] = 30;
            }

            plan =
            [
                ("get_landing_page_blended_table", withLimit),
                ("get_opportunity_matrix", withLimit),
            ];
        }
        else
        {
            var withLimit = baseArgs.DeepClone() as JsonObject ?? [];
            withLimit["limit"] = limit?.DeepClone() ?? 30;
            var mapLimit = baseArgs.DeepClone() as JsonObject ?? [];
            mapLimit["limit"] = limit?.DeepClone() ?? 20;
            plan =
            [
                ("get_opportunity_matrix", withLimit),
                ("get_issue_to_traffic_map", mapLimit),
            ];
        }

        var steps = await RunStepsAsync(services, scoped, plan, cancellationToken);
        return new JsonObject
        {
            ["workflow"] = "insight",
            ["type"] = wfType,
            ["steps"] = steps,
        };
    }

    public static async Task<JsonObject> RunTechnicalWorkflowAsync(
        IServiceProvider services,
        NpgsqlConnection conn,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        _ = conn;
        var scoped = ctx.WithArgs(args);
        var baseArgs = BuildBaseArgs(scoped);
        var plan = new List<(string, JsonObject)>
        {
            ("get_report_summary", baseArgs),
            ("get_critical_issues", baseArgs),
            ("get_issue_priority_breakdown", baseArgs),
        };

        if (JsonCoercion.AsInt(args["baseline_report_id"]) is int baseline)
        {
            var compareArgs = baseArgs.DeepClone() as JsonObject ?? [];
            compareArgs["baseline_report_id"] = baseline;
            plan.Add(("compare_issue_deltas", compareArgs));
        }

        var steps = await RunStepsAsync(services, scoped, plan, cancellationToken);
        return new JsonObject { ["workflow"] = "technical", ["steps"] = steps };
    }

    public static async Task<JsonObject> RunKeywordWorkflowAsync(
        IServiceProvider services,
        NpgsqlConnection conn,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        _ = conn;
        var scoped = ctx.WithArgs(args);
        if (scoped.PropertyId is null)
        {
            return new JsonObject { ["error"] = "property_id is required" };
        }

        var baseArgs = new JsonObject
        {
            ["property_id"] = scoped.PropertyId,
            ["limit"] = args["limit"]?.DeepClone() ?? 20,
        };
        var plan = new List<(string, JsonObject)>
        {
            ("get_brand_keyword_split", baseArgs),
            ("get_striking_distance_keywords", baseArgs),
            ("list_keywords_ctr_opportunity", baseArgs),
        };
        var steps = await RunStepsAsync(services, scoped, plan, cancellationToken);
        return new JsonObject { ["workflow"] = "keyword", ["steps"] = steps };
    }

    public static async Task<JsonObject> RunDomainAgentAsync(
        IServiceProvider services,
        NpgsqlConnection conn,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        _ = conn;
        var scoped = ctx.WithArgs(args);
        var task = JsonCoercion.AsString(args["task"])?.Trim() ?? "";
        var domain = (JsonCoercion.AsString(args["domain"]) ?? "").Trim().ToLowerInvariant();
        var maxSteps = PayloadSliceHelpers.ParseLimit(args["max_steps"], 5, 8);
        if (string.IsNullOrEmpty(task))
        {
            return new JsonObject { ["error"] = "task is required" };
        }

        var catalog = services.GetRequiredService<ToolCatalog>();
        HashSet<string> pool;
        if (!string.IsNullOrEmpty(domain))
        {
            pool = McpToolDomains.ToolNamesForEnabledDomains(catalog.ToolNames, [domain]);
        }
        else
        {
            pool = catalog.ToolNames.ToHashSet(StringComparer.Ordinal);
        }

        var matches = ToolCatalogSearch.Search(catalog, task, maxSteps * 2);
        var picked = new List<string>();
        foreach (var match in matches)
        {
            var name = match["name"]?.GetValue<string>() ?? "";
            if (pool.Contains(name) && !picked.Contains(name))
            {
                picked.Add(name);
            }

            if (picked.Count >= maxSteps)
            {
                break;
            }
        }

        if (picked.Count == 0)
        {
            foreach (var match in matches)
            {
                var name = match["name"]?.GetValue<string>() ?? "";
                if (!picked.Contains(name) && catalog.TryGetDefinition(name, out _))
                {
                    picked.Add(name);
                }

                if (picked.Count >= maxSteps)
                {
                    break;
                }
            }
        }

        if (picked.Count == 0 && !string.IsNullOrEmpty(domain))
        {
            picked.AddRange(McpToolDomains.GroupToolsByDomain(catalog.ToolNames)
                .GetValueOrDefault(domain, [])
                .Take(maxSteps));
        }

        var baseArgs = BuildBaseArgs(scoped);
        baseArgs["limit"] = 20;
        var plan = picked.Select(name => (name, baseArgs.DeepClone() as JsonObject ?? [])).ToList();
        var steps = await RunStepsAsync(services, scoped, plan, cancellationToken);
        return new JsonObject
        {
            ["task"] = task,
            ["domain"] = !string.IsNullOrEmpty(domain)
                ? domain
                : picked.Count > 0 ? McpToolDomains.ClassifyToolDomain(picked[0]) : "",
            ["steps"] = steps,
            ["tools_used"] = new JsonArray(picked.Select(p => JsonValue.Create(p)).ToArray()),
        };
    }

    private static JsonObject BuildBaseArgs(AuditToolContext scoped)
    {
        var args = new JsonObject();
        if (scoped.PropertyId is int pid)
        {
            args["property_id"] = pid;
        }

        if (scoped.ReportId is int rid)
        {
            args["report_id"] = rid;
        }

        return args;
    }

    private static async Task<JsonArray> RunStepsAsync(
        IServiceProvider services,
        AuditToolContext ctx,
        IReadOnlyList<(string Tool, JsonObject ToolArgs)> plan,
        CancellationToken cancellationToken)
    {
        var dispatcher = services.GetRequiredService<ToolDispatcher>();
        var dataSource = services.GetRequiredService<Npgsql.NpgsqlDataSource>();
        var steps = new JsonArray();
        var tasks = plan.Select(async step =>
        {
            await using var stepConn = await dataSource.OpenConnectionAsync(cancellationToken);
            var result = await dispatcher.DispatchAsync(step.Tool, ctx, step.ToolArgs, cancellationToken);
            return new JsonObject { ["tool"] = step.Tool, ["result"] = result };
        });
        foreach (var stepResult in await Task.WhenAll(tasks))
        {
            steps.Add(stepResult);
        }

        return steps;
    }
}
