using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using AiService.Api.Application.Json;
using AiService.Api.Application.Prompts;
using AiService.Api.Application.Repositories;
using AiService.Api.Domain.Repositories;
using AiService.Api.Providers.Chat;

namespace AiService.Api.Application.Services;

public sealed class IssuesActionPlanService(
    ILlmSettingsRepository configRepository,
    LlmCacheRepository cacheRepository,
    StructuredCompletionService completionService)
{
    private const int MaxIssues = 80;

    public async Task<JsonObject> GenerateAsync(
        JsonObject payload,
        bool refresh = false,
        CancellationToken cancellationToken = default)
    {
        var settings = await configRepository.LoadAsync(cancellationToken);
        if (!LlmConfigHelpers.IsEnabled(settings))
        {
            return new JsonObject { ["ok"] = false, ["error"] = "AI insights are disabled." };
        }

        if (!FixSuggestionSupport.FixSuggestionsEnabled(settings))
        {
            return new JsonObject { ["ok"] = false, ["error"] = "Issue fix suggestions are disabled in AI task settings." };
        }

        var domain = (payload["domain"]?.GetValue<string>() ?? "").Trim();
        var issues = CompactIssues(payload["issues"]);
        if (string.IsNullOrWhiteSpace(domain))
        {
            return new JsonObject { ["ok"] = false, ["error"] = "domain required." };
        }

        if (issues.Count == 0)
        {
            return new JsonObject { ["ok"] = false, ["error"] = "issues required." };
        }

        var model = LlmConfigHelpers.DisplayModel(settings);
        var cachePayload = new JsonObject
        {
            ["domain"] = domain,
            ["issues"] = JsonNodeCopy.CloneArray(issues),
        };
        var cacheKey = SHA256.HashData(
            Encoding.UTF8.GetBytes($"issues_action_plan:{LlmPrompts.Version}:{model}:{cachePayload.ToJsonString()}"));
        var cacheKeyHex = Convert.ToHexStringLower(cacheKey);

        if (!refresh)
        {
            var cached = await cacheRepository.ReadObjectAsync(cacheKeyHex, cancellationToken);
            if (cached is not null)
            {
                return BuildSuccess(cached, cached: true);
            }
        }

        var userPayload = new JsonObject
        {
            ["domain"] = domain,
            ["issue_count"] = issues.Count,
            ["issues"] = issues,
        };

        try
        {
            var user = userPayload.ToJsonString()[..Math.Min(userPayload.ToJsonString().Length, 12000)];
            var parsed = await completionService.CompleteJsonAsync(
                LlmPrompts.IssuesActionPlanSystem,
                user,
                settings,
                cancellationToken);

            if (parsed.Count == 0)
            {
                parsed = new JsonObject { ["summary"] = "No plan returned." };
            }

            await cacheRepository.WriteObjectAsync(cacheKeyHex, parsed, cancellationToken);
            return BuildSuccess(parsed, cached: false);
        }
        catch (Exception ex)
        {
            return new JsonObject { ["ok"] = false, ["error"] = ex.Message };
        }
    }

    private static JsonObject BuildSuccess(JsonObject parsed, bool cached)
    {
        var planMd = FormatPlanMarkdown(parsed);
        return new JsonObject
        {
            ["ok"] = true,
            ["cached"] = cached,
            ["plan"] = planMd,
            ["summary"] = parsed["summary"]?.DeepClone(),
            ["phases"] = parsed["phases"]?.DeepClone(),
            ["quick_wins"] = parsed["quick_wins"]?.DeepClone(),
            ["notes"] = parsed["notes"]?.DeepClone(),
            ["provenance"] = "AI insights",
        };
    }

    private static JsonArray CompactIssues(JsonNode? raw)
    {
        var outArr = new JsonArray();
        if (raw is not JsonArray rows)
        {
            return outArr;
        }

        foreach (var rowNode in rows)
        {
            if (rowNode is not JsonObject row)
            {
                continue;
            }

            var message = (row["message"]?.GetValue<string>() ?? "").Trim();
            if (string.IsNullOrEmpty(message))
            {
                continue;
            }

            var item = new JsonObject
            {
                ["category"] = row["category"]?.GetValue<string>() ?? "",
                ["message"] = message,
                ["priority"] = row["priority"]?.GetValue<string>() ?? "Medium",
                ["url_count"] = row["url_count"]?.GetValue<int?>()
                    ?? row["urlCount"]?.GetValue<int?>()
                    ?? 0,
            };

            var sampleUrls = new JsonArray();
            var samples = row["sample_urls"] as JsonArray ?? row["sampleUrls"] as JsonArray;
            if (samples is not null)
            {
                foreach (var urlNode in samples.Take(5))
                {
                    var url = (urlNode?.GetValue<string>() ?? "").Trim();
                    if (!string.IsNullOrEmpty(url))
                    {
                        sampleUrls.Add(url);
                    }
                }
            }

            item["sample_urls"] = sampleUrls;

            if (row.TryGetPropertyValue("recommendation", out var rec) && rec is not null)
            {
                item["recommendation"] = rec.GetValue<string>();
            }

            foreach (var (src, dst) in new[] { ("impact_score", "impact_score"), ("gsc_clicks", "gsc_clicks") })
            {
                JsonNode? val = row[src] ?? row[src == "impact_score" ? "impactScore" : "gscClicks"];
                if (val is JsonValue jv && jv.TryGetValue(out double d))
                {
                    item[dst] = d;
                }
            }

            outArr.Add(item);
            if (outArr.Count >= MaxIssues)
            {
                break;
            }
        }

        return outArr;
    }

    private static string FormatPlanMarkdown(JsonObject data)
    {
        var lines = new List<string>();
        var summary = (data["summary"]?.GetValue<string>() ?? "").Trim();
        if (!string.IsNullOrEmpty(summary))
        {
            lines.Add(summary);
            lines.Add("");
        }

        if (data["quick_wins"] is JsonArray quickWins && quickWins.Count > 0)
        {
            lines.Add("### Quick wins");
            foreach (var item in quickWins.Take(8))
            {
                var text = (item?.GetValue<string>() ?? "").Trim();
                if (!string.IsNullOrEmpty(text))
                {
                    lines.Add($"- {text}");
                }
            }

            lines.Add("");
        }

        if (data["phases"] is JsonArray phases && phases.Count > 0)
        {
            lines.Add("### Phased plan");
            foreach (var phaseNode in phases.Take(6))
            {
                if (phaseNode is not JsonObject phase)
                {
                    continue;
                }

                var name = (phase["name"]?.GetValue<string>() ?? "Phase").Trim();
                var effort = (phase["effort"]?.GetValue<string>() ?? "").Trim();
                var header = $"**{name}**";
                if (!string.IsNullOrEmpty(effort))
                {
                    header += $" (effort: {effort})";
                }

                lines.Add(header);
                if (phase["actions"] is JsonArray actions)
                {
                    foreach (var action in actions.Take(8))
                    {
                        var text = (action?.GetValue<string>() ?? "").Trim();
                        if (!string.IsNullOrEmpty(text))
                        {
                            lines.Add($"- {text}");
                        }
                    }
                }

                lines.Add("");
            }
        }

        var notes = (data["notes"]?.GetValue<string>() ?? "").Trim();
        if (!string.IsNullOrEmpty(notes))
        {
            lines.Add("### Notes");
            lines.Add(notes);
        }

        return string.Join('\n', lines).Trim();
    }
}
