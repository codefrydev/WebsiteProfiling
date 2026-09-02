using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using AiService.Api.Application.Prompts;
using AiService.Api.Application.Repositories;
using AiService.Api.Domain.Repositories;
using AiService.Api.Providers.Chat;

namespace AiService.Api.Application.Services;

public sealed class FixSuggestionService(
    ILlmSettingsRepository configRepository,
    LlmCacheRepository cacheRepository,
    StructuredCompletionService completionService)
{
    private static readonly JsonObject DefaultFix = new()
    {
        ["fix"] = "Review the issue on the affected URL and apply standard remediation.",
        ["effort"] = "medium",
    };

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

        var userPayload = BuildUserPayload(payload);
        var message = userPayload["message"]?.GetValue<string>() ?? "";
        if (string.IsNullOrWhiteSpace(message))
        {
            return new JsonObject { ["ok"] = false, ["error"] = "message required." };
        }

        var source = userPayload["source"]?.GetValue<string>() ?? "issue";
        var model = LlmConfigHelpers.DisplayModel(settings);
        var cacheKey = SHA256.HashData(
            Encoding.UTF8.GetBytes($"fix_suggestion:{LlmPrompts.Version}:{model}:{source}:{userPayload.ToJsonString()}"));
        var cacheKeyHex = Convert.ToHexStringLower(cacheKey);

        if (!refresh)
        {
            var cached = await cacheRepository.ReadObjectAsync(cacheKeyHex, cancellationToken);
            if (cached is not null)
            {
                return new JsonObject
                {
                    ["ok"] = true,
                    ["cached"] = true,
                    ["fix"] = cached.DeepClone(),
                    ["provenance"] = "AI insights",
                };
            }
        }

        if (!LlmPrompts.FixSuggestionPrompts.TryGetValue(source, out var system))
        {
            system = LlmPrompts.IssueFixSystem;
        }

        try
        {
            var user = Truncate(userPayload.ToJsonString(), 8000);
            var fix = await completionService.CompleteJsonAsync(system, user, settings, cancellationToken);
            if (fix.Count == 0 || string.IsNullOrWhiteSpace(fix["fix"]?.GetValue<string>()))
            {
                fix = DefaultFix.DeepClone() as JsonObject ?? [];
            }

            await cacheRepository.WriteObjectAsync(cacheKeyHex, fix, cancellationToken);
            return new JsonObject
            {
                ["ok"] = true,
                ["cached"] = false,
                ["fix"] = fix.DeepClone(),
                ["provenance"] = "AI insights",
            };
        }
        catch (Exception ex)
        {
            return new JsonObject { ["ok"] = false, ["error"] = ex.Message };
        }
    }

    private static JsonObject BuildUserPayload(JsonObject payload)
    {
        var source = NormalizeSource(payload["source"]?.GetValue<string>());
        var result = new JsonObject
        {
            ["source"] = source,
            ["message"] = (payload["message"]?.GetValue<string>() ?? "").Trim(),
        };

        if (payload.TryGetPropertyValue("url", out var urlNode) && urlNode is not null)
        {
            result["url"] = urlNode.DeepClone();
        }

        if (payload["context"] is JsonObject context && context.Count > 0)
        {
            result["context"] = context.DeepClone();
        }

        if (source == "issue")
        {
            var legacy = new JsonObject();
            foreach (var key in new[] { "priority", "category", "type", "finding_type", "recommendation", "existing_recommendation" })
            {
                if (payload.TryGetPropertyValue(key, out var node) && node is not null)
                {
                    legacy[key] = node.DeepClone();
                }
            }

            if (legacy.Count > 0)
            {
                var ctx = result["context"] as JsonObject ?? new JsonObject();
                foreach (var prop in legacy)
                {
                    ctx[prop.Key] = prop.Value?.DeepClone();
                }

                result["context"] = ctx;
            }
        }

        return result;
    }

    private static string NormalizeSource(string? raw)
    {
        var source = (raw ?? "issue").Trim().ToLowerInvariant();
        return LlmPrompts.FixSuggestionPrompts.ContainsKey(source) ? source : "issue";
    }

    private static string Truncate(string text, int max)
        => text.Length <= max ? text : text[..max];
}
