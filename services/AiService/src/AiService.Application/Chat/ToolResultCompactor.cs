using System.Text.Json.Nodes;
using AiService.Tools.Slice;

namespace AiService.Application.Chat;

/// <summary>
/// Produces compact tool result JSON for LLM follow-up rounds and UI-sized slices for SSE.
/// Full results are persisted separately in <see cref="ChatToolEvent"/>.
/// </summary>
public static class ToolResultCompactor
{
    public const int DefaultLlmListLimit = 20;
    public const int DefaultUiListLimit = 50;

    private static readonly HashSet<string> ExportTools = new(StringComparer.Ordinal)
    {
        "export_audit_report",
        "export_list_as_csv",
        "export_compare_csv",
        "export_sitemap_xml",
    };

    private static readonly HashSet<string> WorkflowTools = new(StringComparer.Ordinal)
    {
        "run_insight_workflow",
        "run_technical_workflow",
        "run_keyword_workflow",
        "run_domain_agent",
    };

    private static readonly HashSet<string> ListKeys = new(StringComparer.Ordinal)
    {
        "items", "issues", "pages", "queries", "rows", "results", "tools", "steps",
        "links", "urls", "entries", "records", "domains", "keywords",
    };

    public static JsonObject CompactForLlm(string toolName, JsonObject full)
        => Compact(full, DefaultLlmListLimit, toolName, forUi: false);

    public static JsonObject CompactForUi(string toolName, JsonObject full)
        => Compact(full, DefaultUiListLimit, toolName, forUi: true);

    public static bool WasTruncated(JsonObject full, JsonObject compact)
        => full.ToJsonString().Length > compact.ToJsonString().Length;

    private static JsonObject Compact(JsonObject full, int listLimit, string toolName, bool forUi)
    {
        if (full["error"] is JsonValue || full["hint"] is JsonValue)
        {
            return full.DeepClone() as JsonObject ?? [];
        }

        if (ExportTools.Contains(toolName) || full["artifact_id"] is not null)
        {
            return CompactExport(full);
        }

        if (WorkflowTools.Contains(toolName))
        {
            return CompactWorkflow(full, listLimit);
        }

        if (toolName == "search_audit_tools")
        {
            return CompactSearchTools(full, forUi ? 12 : 8);
        }

        var output = new JsonObject();
        foreach (var (key, value) in full)
        {
            if (value is JsonArray array && ListKeys.Contains(key))
            {
                var items = array.Select(x => x).ToList();
                var capped = PayloadSliceHelpers.CapList(items, listLimit, listLimit);
                output[key] = capped["items"]?.DeepClone();
                output["total"] = capped["total"]?.DeepClone();
                output["truncated"] = capped["truncated"]?.DeepClone();
                continue;
            }

            if (value is JsonArray nestedArray && nestedArray.Count > listLimit)
            {
                var capped = PayloadSliceHelpers.CapList(
                    nestedArray.Select(x => x).ToList(),
                    listLimit,
                    listLimit);
                output[key] = capped["items"]?.DeepClone();
                continue;
            }

            if (value is JsonObject obj && obj.Count > 24)
            {
                output[key] = ShallowObject(obj, maxFields: forUi ? 16 : 12);
                continue;
            }

            output[key] = value?.DeepClone();
        }

        return output;
    }

    private static JsonObject CompactExport(JsonObject full)
    {
        var compact = new JsonObject();
        foreach (var key in new[] { "artifact_id", "format", "filename", "mime_type", "ready", "url", "error", "hint", "message" })
        {
            if (full.TryGetPropertyValue(key, out var value) && value is not null)
            {
                compact[key] = value.DeepClone();
            }
        }

        if (compact.Count == 0)
        {
            return ShallowObject(full, maxFields: 8);
        }

        return compact;
    }

    private static JsonObject CompactWorkflow(JsonObject full, int listLimit)
    {
        var compact = new JsonObject();
        foreach (var (key, value) in full)
        {
            if (key is "workflow" or "type" or "error" or "hint")
            {
                compact[key] = value?.DeepClone();
            }
        }

        if (full["steps"] is JsonArray steps)
        {
            var stepSummaries = new JsonArray();
            var count = 0;
            foreach (var stepNode in steps)
            {
                if (count >= listLimit)
                {
                    break;
                }

                if (stepNode is not JsonObject step)
                {
                    continue;
                }

                var tool = JsonScalar.AsString(step["tool"]) ?? JsonScalar.AsString(step["name"]) ?? "";
                var result = step["result"] as JsonObject;
                var summary = new JsonObject
                {
                    ["tool"] = tool,
                    ["ok"] = result?["error"] is null,
                };
                if (JsonScalar.AsString(result?["error"]) is { Length: > 0 } err)
                {
                    summary["error"] = err;
                }
                else if (result is not null)
                {
                    summary["summary"] = SummarizeResult(result);
                }

                stepSummaries.Add(summary);
                count++;
            }

            compact["steps"] = stepSummaries;
            compact["step_count"] = steps.Count;
            compact["truncated"] = steps.Count > count;
        }

        return compact;
    }

    private static JsonObject CompactSearchTools(JsonObject full, int nameLimit)
    {
        var compact = new JsonObject();
        foreach (var (key, value) in full)
        {
            if (key is "query" or "total" or "error")
            {
                compact[key] = value?.DeepClone();
            }
        }

        if (full["tool_names"] is JsonArray names)
        {
            var slice = new JsonArray();
            for (var i = 0; i < Math.Min(nameLimit, names.Count); i++)
            {
                slice.Add(names[i]?.DeepClone());
            }

            compact["tool_names"] = slice;
        }

        if (full["tools"] is JsonArray tools)
        {
            var slice = new JsonArray();
            for (var i = 0; i < Math.Min(nameLimit, tools.Count); i++)
            {
                var entry = tools[i] as JsonObject;
                if (entry is null)
                {
                    continue;
                }

                slice.Add(new JsonObject
                {
                    ["name"] = entry["name"]?.DeepClone(),
                    ["description"] = entry["description"]?.DeepClone(),
                    ["domain"] = entry["domain"]?.DeepClone(),
                });
            }

            compact["tools"] = slice;
        }

        return compact;
    }

    private static JsonObject ShallowObject(JsonObject obj, int maxFields)
    {
        var shallow = new JsonObject();
        var count = 0;
        foreach (var (key, value) in obj)
        {
            if (count >= maxFields)
            {
                shallow["_truncated"] = true;
                break;
            }

            shallow[key] = value switch
            {
                JsonObject => JsonValue.Create("[object]"),
                JsonArray array => JsonValue.Create($"[array:{array.Count}]"),
                _ => value?.DeepClone(),
            };
            count++;
        }

        return shallow;
    }

    private static string SummarizeResult(JsonObject result)
    {
        if (JsonScalar.AsInt(result["total"]) is int total)
        {
            return $"total={total}";
        }

        if (result["health_score"] is JsonValue healthScore)
        {
            return $"health_score={healthScore.ToJsonString()}";
        }

        if (JsonScalar.AsString(result["error"]) is { Length: > 0 } err)
        {
            return err.Length > 120 ? err[..120] : err;
        }

        var json = result.ToJsonString();
        return json.Length > 160 ? json[..160] + "…" : json;
    }
}
