using AiService.Api.Application.Persistence;
using AiService.Api.Domain.Models;
using AiService.Api.Domain.Repositories;
using Microsoft.EntityFrameworkCore;

namespace AiService.Api.Application.Repositories;

public sealed class LlmSettingsRepository(AiDbContext db) : ILlmSettingsRepository
{
    private const long SingletonId = 1;

    public async Task<LlmSettings> LoadAsync(CancellationToken cancellationToken = default)
        => await LoadInternalAsync(maskSecrets: false, cancellationToken);

    public async Task<LlmSettings> LoadForClientAsync(CancellationToken cancellationToken = default)
        => await LoadInternalAsync(maskSecrets: true, cancellationToken);

    public async Task MergeAsync(LlmSettingsPatch patch, CancellationToken cancellationToken = default)
    {
        var row = await db.LlmSettings.AsTracking()
            .FirstOrDefaultAsync(x => x.Id == SingletonId, cancellationToken);
        if (row is not null)
        {
            ApplySettingsPatch(row, patch);
            row.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(cancellationToken);
        }

        if (patch.ProviderProfiles is not { Count: > 0 })
        {
            return;
        }

        foreach (var profile in patch.ProviderProfiles)
        {
            if (profile.SavedModel is null)
            {
                continue;
            }

            var normalized = profile.Provider.Trim().ToLowerInvariant();
            var existing = await db.LlmProviderProfiles.AsTracking()
                .FirstOrDefaultAsync(x => x.Provider == normalized, cancellationToken);
            if (existing is null)
            {
                db.LlmProviderProfiles.Add(new Domain.Entities.LlmProviderProfileEntry
                {
                    Provider = normalized,
                    SavedModel = profile.SavedModel,
                });
            }
            else
            {
                existing.SavedModel = profile.SavedModel;
            }
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task MergeProviderApiKeyAsync(
        string provider,
        string? apiKey,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(provider))
        {
            return;
        }

        var normalizedProvider = provider.Trim().ToLowerInvariant();
        var existing = await db.LlmProviderProfiles.AsTracking()
            .FirstOrDefaultAsync(x => x.Provider == normalizedProvider, cancellationToken);
        var existingKey = existing?.ApiKey ?? "";

        if (LlmSettingsSecretMask.IsMaskedSentinel(apiKey))
        {
            return;
        }

        if (string.IsNullOrWhiteSpace(apiKey) && !string.IsNullOrWhiteSpace(existingKey))
        {
            return;
        }

        var value = apiKey ?? "";
        var touchTimestamp = !string.Equals(existingKey, value, StringComparison.Ordinal);
        if (existing is null)
        {
            db.LlmProviderProfiles.Add(new Domain.Entities.LlmProviderProfileEntry
            {
                Provider = normalizedProvider,
                ApiKey = value,
                ApiKeyUpdatedAt = touchTimestamp ? DateTimeOffset.UtcNow : null,
            });
        }
        else
        {
            existing.ApiKey = value;
            if (touchTimestamp)
            {
                existing.ApiKeyUpdatedAt = DateTimeOffset.UtcNow;
            }
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    private async Task<LlmSettings> LoadInternalAsync(bool maskSecrets, CancellationToken cancellationToken)
    {
        var row = await db.LlmSettings.AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == SingletonId, cancellationToken);
        var providers = await LoadProvidersAsync(maskSecrets, cancellationToken);
        if (row is null)
        {
            return new LlmSettings { Providers = providers };
        }

        return new LlmSettings
        {
            Enabled = row.Enabled,
            Provider = row.Provider.Trim(),
            ActiveModel = row.ActiveModel.Trim(),
            OllamaBaseUrl = row.OllamaBaseUrl.Trim(),
            EnableNer = row.EnableNer,
            EnableKeyphrases = row.EnableKeyphrases,
            EnableSimilarInternal = row.EnableSimilarInternal,
            EnableKeywordClusters = row.EnableKeywordClusters,
            EnableIssueFixes = row.EnableIssueFixes,
            EnableAuditSummary = row.EnableAuditSummary,
            EnablePageCoach = row.EnablePageCoach,
            EnableContentStudio = row.EnableContentStudio,
            EnableDashboards = row.EnableDashboards,
            ChatAssistantName = row.ChatAssistantName.Trim(),
            ChatAssistantAvatarUrl = row.ChatAssistantAvatarUrl.Trim(),
            ChatUnlimitedToolRounds = row.ChatUnlimitedToolRounds,
            ChatAllowCrawl = row.ChatAllowCrawl,
            ChatFastNarrative = row.ChatFastNarrative,
            MaxPages = row.MaxPages,
            BatchSize = row.BatchSize,
            Concurrency = row.Concurrency,
            TimeoutSeconds = row.TimeoutSeconds,
            SimilarTopK = row.SimilarTopK,
            UpdatedAt = row.UpdatedAt,
            Providers = providers,
        };
    }

    private async Task<IReadOnlyList<LlmProviderProfile>> LoadProvidersAsync(
        bool maskSecrets,
        CancellationToken cancellationToken)
    {
        return await db.LlmProviderProfiles.AsNoTracking()
            .OrderBy(x => x.Provider)
            .Select(x => new LlmProviderProfile
            {
                Provider = x.Provider.Trim(),
                ApiKey = maskSecrets ? LlmSettingsSecretMask.MaskApiKey(x.ApiKey) : x.ApiKey,
                SavedModel = x.SavedModel.Trim(),
                ApiKeyUpdatedAt = x.ApiKeyUpdatedAt,
            })
            .ToListAsync(cancellationToken);
    }

    private static void ApplySettingsPatch(Domain.Entities.LlmSettingsEntry row, LlmSettingsPatch patch)
    {
        if (patch.Enabled is not null) row.Enabled = patch.Enabled.Value;
        if (patch.Provider is not null) row.Provider = patch.Provider;
        if (patch.ActiveModel is not null) row.ActiveModel = patch.ActiveModel;
        if (patch.OllamaBaseUrl is not null) row.OllamaBaseUrl = patch.OllamaBaseUrl;
        if (patch.EnableNer is not null) row.EnableNer = patch.EnableNer.Value;
        if (patch.EnableKeyphrases is not null) row.EnableKeyphrases = patch.EnableKeyphrases.Value;
        if (patch.EnableSimilarInternal is not null) row.EnableSimilarInternal = patch.EnableSimilarInternal.Value;
        if (patch.EnableKeywordClusters is not null) row.EnableKeywordClusters = patch.EnableKeywordClusters.Value;
        if (patch.EnableIssueFixes is not null) row.EnableIssueFixes = patch.EnableIssueFixes.Value;
        if (patch.EnableAuditSummary is not null) row.EnableAuditSummary = patch.EnableAuditSummary.Value;
        if (patch.EnablePageCoach is not null) row.EnablePageCoach = patch.EnablePageCoach.Value;
        if (patch.EnableContentStudio is not null) row.EnableContentStudio = patch.EnableContentStudio.Value;
        if (patch.EnableDashboards is not null) row.EnableDashboards = patch.EnableDashboards.Value;
        if (patch.ChatAssistantName is not null) row.ChatAssistantName = patch.ChatAssistantName;
        if (patch.ChatAssistantAvatarUrl is not null) row.ChatAssistantAvatarUrl = patch.ChatAssistantAvatarUrl;
        if (patch.ChatUnlimitedToolRounds is not null) row.ChatUnlimitedToolRounds = patch.ChatUnlimitedToolRounds.Value;
        if (patch.ChatAllowCrawl is not null) row.ChatAllowCrawl = patch.ChatAllowCrawl.Value;
        if (patch.ChatFastNarrative is not null) row.ChatFastNarrative = patch.ChatFastNarrative.Value;
        if (patch.MaxPages is not null) row.MaxPages = patch.MaxPages.Value;
        if (patch.BatchSize is not null) row.BatchSize = patch.BatchSize.Value;
        if (patch.Concurrency is not null) row.Concurrency = patch.Concurrency.Value;
        if (patch.TimeoutSeconds is not null) row.TimeoutSeconds = patch.TimeoutSeconds.Value;
        if (patch.SimilarTopK is not null) row.SimilarTopK = patch.SimilarTopK.Value;
    }
}
