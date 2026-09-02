using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using AiService.Api.Application.Prompts;
using AiService.Api.Application.Repositories;
using AiService.Api.Domain.Models;

namespace AiService.Api.Application.Services;

internal static class LlmTaskCache
{
    public static string CacheKey(string task, string model, object payload)
    {
        var body = JsonSerializer.Serialize(payload, new JsonSerializerOptions { WriteIndented = false });
        var digest = SHA256.HashData(Encoding.UTF8.GetBytes($"{LlmPrompts.Version}:{task}:{model}:{body}"));
        return Convert.ToHexStringLower(digest);
    }

    public static async Task<JsonObject?> ReadAsync(
        LlmCacheRepository cache,
        string key,
        CancellationToken cancellationToken)
    {
        return await cache.ReadObjectAsync(key, cancellationToken);
    }

    public static async Task WriteAsync(
        LlmCacheRepository cache,
        string key,
        JsonObject data,
        CancellationToken cancellationToken)
        => await cache.WriteObjectAsync(key, data, cancellationToken);
}

internal static class FixSuggestionSupport
{
    public static bool FixSuggestionsEnabled(LlmSettings settings) => settings.EnableIssueFixes;
}
