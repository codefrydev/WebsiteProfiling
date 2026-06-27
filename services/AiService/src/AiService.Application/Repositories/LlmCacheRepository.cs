using System.Text.Json;
using System.Text.Json.Nodes;
using AiService.Application.Json;
using AiService.Application.Persistence;
using AiService.Domain.Entities;
using AiService.Domain.Repositories;
using Microsoft.EntityFrameworkCore;

namespace AiService.Application.Repositories;

public sealed class LlmCacheRepository(AiDbContext db) : ILlmCacheRepository
{
    public async Task<string?> ReadAsync(string cacheKey, CancellationToken cancellationToken = default)
    {
        var row = await db.LlmCache.AsNoTracking()
            .FirstOrDefaultAsync(x => x.CacheKey == cacheKey, cancellationToken);
        return row?.ResponseJson;
    }

    public async Task WriteAsync(string cacheKey, string responseJson, CancellationToken cancellationToken = default)
    {
        var normalized = NormalizeJson(responseJson);
        var now = DateTimeOffset.UtcNow;
        var existing = await db.LlmCache.FirstOrDefaultAsync(x => x.CacheKey == cacheKey, cancellationToken);
        if (existing is null)
        {
            db.LlmCache.Add(new LlmCacheEntry
            {
                CacheKey = cacheKey,
                ResponseJson = normalized,
                CreatedAt = now,
            });
        }
        else
        {
            existing.ResponseJson = normalized;
            existing.CreatedAt = now;
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<IReadOnlyDictionary<string, string>> ReadBatchAsync(
        IReadOnlyList<string> cacheKeys,
        CancellationToken cancellationToken = default)
    {
        if (cacheKeys.Count == 0)
        {
            return new Dictionary<string, string>();
        }

        var rows = await db.LlmCache.AsNoTracking()
            .Where(x => cacheKeys.Contains(x.CacheKey))
            .ToListAsync(cancellationToken);

        return rows.ToDictionary(x => x.CacheKey, x => x.ResponseJson, StringComparer.Ordinal);
    }

    public async Task<JsonObject?> ReadObjectAsync(string cacheKey, CancellationToken cancellationToken = default)
    {
        var raw = await ReadAsync(cacheKey, cancellationToken);
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        try
        {
            var parsed = JsonNode.Parse(raw) as JsonObject;
            return parsed is null ? null : JsonNodeCopy.CloneObject(parsed);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    public async Task WriteObjectAsync(string cacheKey, JsonObject data, CancellationToken cancellationToken = default)
        => await WriteAsync(cacheKey, JsonNodeCopy.CloneObject(data).ToJsonString(), cancellationToken);

    private static string NormalizeJson(string responseJson)
    {
        try
        {
            var node = JsonNode.Parse(responseJson);
            return node?.ToJsonString() ?? responseJson;
        }
        catch (JsonException)
        {
            return JsonSerializer.Serialize(responseJson);
        }
    }
}
