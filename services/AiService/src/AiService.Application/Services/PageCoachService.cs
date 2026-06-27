using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using AiService.Application.Persistence;
using AiService.Application.Prompts;
using AiService.Application.Repositories;
using AiService.Domain.Repositories;
using AiService.Providers.Chat;
using Microsoft.EntityFrameworkCore;

namespace AiService.Application.Services;

public sealed class PageCoachService(
    ILlmSettingsRepository configRepository,
    LlmCacheRepository cacheRepository,
    StructuredCompletionService completionService,
    AiDbContext db)
{
    public async Task<JsonObject> RunAsync(
        string pageUrl,
        bool refresh = false,
        CancellationToken cancellationToken = default)
    {
        var settings = await configRepository.LoadAsync(cancellationToken);
        if (!LlmConfigHelpers.IsEnabled(settings))
        {
            return new JsonObject
            {
                ["ok"] = false,
                ["error"] = "AI insights are disabled. Enable them in Pipeline → Content & AI.",
            };
        }

        if (!settings.EnablePageCoach)
        {
            return new JsonObject { ["ok"] = false, ["error"] = "Page coach is disabled in AI task settings." };
        }

        var context = await BuildPageContextAsync(pageUrl, cancellationToken);
        var model = LlmConfigHelpers.DisplayModel(settings);
        var payloadStr = context.ToJsonString();
        var cacheKey = SHA256.HashData(
            Encoding.UTF8.GetBytes($"page_coach:v2:{LlmPrompts.Version}:{model}:{pageUrl}:{payloadStr}"));
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
                    ["coach"] = cached.DeepClone(),
                    ["context"] = context.DeepClone(),
                };
            }
        }

        try
        {
            var user = payloadStr[..Math.Min(payloadStr.Length, 12000)];
            var coach = await completionService.CompleteJsonAsync(
                LlmPrompts.PageCoachSystem,
                user,
                settings,
                cancellationToken);

            if (coach.Count == 0)
            {
                coach = new JsonObject { ["summary"] = "No structured coach output returned." };
            }

            await cacheRepository.WriteObjectAsync(cacheKeyHex, coach, cancellationToken);
            return new JsonObject
            {
                ["ok"] = true,
                ["cached"] = false,
                ["coach"] = coach.DeepClone(),
                ["context"] = context.DeepClone(),
            };
        }
        catch (Exception ex)
        {
            return new JsonObject
            {
                ["ok"] = false,
                ["error"] = ex.Message,
                ["context"] = context.DeepClone(),
            };
        }
    }

    private async Task<JsonObject> BuildPageContextAsync(string pageUrl, CancellationToken cancellationToken)
    {
        var ctx = new JsonObject { ["page_url"] = pageUrl, ["link"] = null, ["current"] = null, ["baseline"] = null, ["compare"] = new JsonArray() };

        var report = await db.ReportPayloads.AsNoTracking()
            .OrderByDescending(x => x.Id)
            .Select(x => x.Data)
            .FirstOrDefaultAsync(cancellationToken);

        if (!string.IsNullOrWhiteSpace(report))
        {
            try
            {
                if (JsonNode.Parse(report) is JsonObject reportObj
                    && reportObj["links"] is JsonArray links)
                {
                    ctx["link"] = FindLink(links, pageUrl)?.DeepClone();
                }
            }
            catch (JsonException)
            {
                // ignore malformed report payload
            }
        }

        return ctx;
    }

    private static JsonObject? FindLink(JsonArray links, string pageUrl)
    {
        var norm = NormalizeUrl(pageUrl);
        foreach (var node in links)
        {
            if (node is not JsonObject rec)
            {
                continue;
            }

            if (NormalizeUrl(rec["url"]?.GetValue<string>() ?? "") == norm)
            {
                return rec;
            }
        }

        return null;
    }

    private static string NormalizeUrl(string url)
        => url.Trim().ToLowerInvariant();
}
