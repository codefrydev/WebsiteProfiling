using AiService.Application.Persistence;
using AiService.Domain.Entities;
using AiService.Domain.Repositories;
using Microsoft.EntityFrameworkCore;

namespace AiService.Application.Repositories;

public sealed class LlmConfigRepository(AiDbContext db) : ILlmConfigRepository
{
    public const string Mask = "*";
    private static readonly HashSet<string> MaskSentinels = new(StringComparer.Ordinal) { Mask, "••••" };

    public async Task<IReadOnlyDictionary<string, string>> LoadAsync(CancellationToken cancellationToken = default)
    {
        var rows = await db.LlmConfig.AsNoTracking().OrderBy(x => x.Key).ToListAsync(cancellationToken);
        var dict = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var row in rows)
        {
            dict[row.Key] = row.Value;
        }

        return LlmConfigSecrets.WithResolvedApiKey(dict);
    }

    public async Task<IReadOnlyList<LlmConfigEntry>> LoadFullAsync(CancellationToken cancellationToken = default)
    {
        var rows = await db.LlmConfig.AsNoTracking().OrderBy(x => x.Key).ToListAsync(cancellationToken);
        return rows.Select(row => new LlmConfigEntry
        {
            Key = row.Key,
            Value = row.IsSecret && !string.IsNullOrEmpty(row.Value) ? Mask : row.Value,
            IsSecret = row.IsSecret,
            UpdatedAt = row.UpdatedAt,
        }).ToList();
    }

    public async Task SaveAsync(IReadOnlyDictionary<string, string> entries, CancellationToken cancellationToken = default)
    {
        var existingRows = await db.LlmConfig.AsNoTracking().ToListAsync(cancellationToken);
        var existing = existingRows.ToDictionary(x => x.Key, x => x.Value, StringComparer.Ordinal);
        var existingSecrets = existingRows.Where(x => x.IsSecret).Select(x => x.Key).ToHashSet(StringComparer.Ordinal);

        var now = DateTimeOffset.UtcNow;
        var normalized = new Dictionary<string, (string Value, bool IsSecret)>(StringComparer.Ordinal);

        foreach (var (key, rawValue) in entries)
        {
            var val = rawValue ?? "";
            if (IsMaskedSentinel(val) && existing.TryGetValue(key, out var prior))
            {
                val = prior;
            }

            var isSecret = existingSecrets.Contains(key) || LlmConfigSecrets.IsSecretKey(key);
            normalized[key] = (val, isSecret);
        }

        await using var tx = await db.Database.BeginTransactionAsync(cancellationToken);
        db.LlmConfig.RemoveRange(await db.LlmConfig.ToListAsync(cancellationToken));
        foreach (var (key, (value, isSecret)) in normalized)
        {
            db.LlmConfig.Add(new LlmConfigEntry
            {
                Key = key,
                Value = value,
                IsSecret = isSecret,
                UpdatedAt = now,
            });
        }

        await db.SaveChangesAsync(cancellationToken);
        await tx.CommitAsync(cancellationToken);
    }

    private static bool IsMaskedSentinel(string value)
    {
        var trimmed = value.Trim();
        if (MaskSentinels.Contains(trimmed))
        {
            return true;
        }

        return trimmed.StartsWith("*", StringComparison.Ordinal) && trimmed.Length <= 4;
    }
}

internal static class LlmConfigSecrets
{
    public static bool IsSecretKey(string key)
    {
        var keyLower = key.ToLowerInvariant();
        return keyLower.EndsWith("_secret", StringComparison.Ordinal)
               || keyLower.EndsWith("_api_key", StringComparison.Ordinal)
               || keyLower.EndsWith("_key", StringComparison.Ordinal)
               || keyLower.Contains("api_key", StringComparison.Ordinal)
               || keyLower.Contains("secret", StringComparison.Ordinal)
               || keyLower.Contains("password", StringComparison.Ordinal)
               || keyLower.Contains("token", StringComparison.Ordinal);
    }

    public static IReadOnlyDictionary<string, string> WithResolvedApiKey(IReadOnlyDictionary<string, string> cfg)
    {
        return AiService.Providers.Chat.LlmConfigHelpers.WithResolvedApiKey(cfg);
    }
}
