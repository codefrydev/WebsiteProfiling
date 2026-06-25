using System.Text.Json.Nodes;
using AiService.Application.Prompts;
using AiService.Domain.Repositories;
using AiService.Providers.Chat;

namespace AiService.Application.Services;

public sealed class DashboardAiService(
    ILlmConfigRepository configRepository,
    StructuredCompletionService completionService)
{
    private static readonly HashSet<string> ValidModes = new(StringComparer.OrdinalIgnoreCase)
    {
        "script", "widget", "dashboard",
    };

    public async Task<JsonObject> GenerateAsync(
        JsonObject payload,
        CancellationToken cancellationToken = default)
    {
        var cfg = await configRepository.LoadAsync(cancellationToken);
        if (!LlmConfigHelpers.IsEnabled(cfg))
        {
            return new JsonObject { ["ok"] = false, ["error"] = "AI insights are disabled.", ["missing"] = true };
        }

        if (!LlmConfigHelpers.IsTruthy(cfg.GetValueOrDefault("llm_enable_dashboards") ?? "true"))
        {
            return new JsonObject { ["ok"] = false, ["error"] = "Dashboard AI is disabled in task settings.", ["missing"] = true };
        }

        var mode = (payload["mode"]?.GetValue<string>() ?? "widget").Trim().ToLowerInvariant();
        if (!ValidModes.Contains(mode))
        {
            return new JsonObject { ["ok"] = false, ["error"] = $"Unknown mode: '{mode}'. Must be one of: script, widget, dashboard." };
        }

        var prompt = (payload["prompt"]?.GetValue<string>() ?? "").Trim();
        if (string.IsNullOrEmpty(prompt))
        {
            return new JsonObject { ["ok"] = false, ["error"] = "prompt is required." };
        }

        try
        {
            var user = payload.ToJsonString()[..Math.Min(payload.ToJsonString().Length, 10_000)];
            var result = await completionService.CompleteJsonAsync(
                LlmPrompts.DashboardAiSystem,
                user,
                cfg,
                cancellationToken);

            if (result.Count == 0)
            {
                return new JsonObject { ["ok"] = false, ["error"] = "AI returned no parseable output." };
            }

            if (!result.ContainsKey("ok"))
            {
                result["ok"] = true;
            }

            return result;
        }
        catch (Exception ex)
        {
            return new JsonObject { ["ok"] = false, ["error"] = ex.Message };
        }
    }
}
