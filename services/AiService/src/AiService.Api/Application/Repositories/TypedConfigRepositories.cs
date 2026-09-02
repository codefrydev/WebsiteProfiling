using AiService.Api.Application.Mcp;
using AiService.Api.Application.Persistence;
using AiService.Api.Domain.Models;
using AiService.Api.Domain.Repositories;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace AiService.Api.Application.Repositories;

public sealed class IntegrationSecretsRepository(AiDbContext db) : IIntegrationSecretsRepository
{
    private const long SingletonId = 1;

    public async Task<IntegrationSecrets> LoadAsync(CancellationToken cancellationToken = default)
    {
        var row = await db.IntegrationSecrets.AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == SingletonId, cancellationToken);
        return row is null
            ? new IntegrationSecrets()
            : new IntegrationSecrets
            {
                BingWebmasterApiKey = row.BingWebmasterApiKey,
                SerpApiKey = row.SerpApiKey,
                GoogleRichResultsApiKey = row.GoogleRichResultsApiKey,
                CrawlAuthPassword = row.CrawlAuthPassword,
                CrawlCookies = row.CrawlCookies,
            };
    }

    public async Task MergeAsync(IntegrationSecretsPatch patch, CancellationToken cancellationToken = default)
    {
        var row = await db.IntegrationSecrets.AsTracking()
            .FirstOrDefaultAsync(x => x.Id == SingletonId, cancellationToken);
        if (row is null)
        {
            return;
        }

        var changed = false;
        if (patch.BingWebmasterApiKey is not null) { row.BingWebmasterApiKey = patch.BingWebmasterApiKey; changed = true; }
        if (patch.SerpApiKey is not null) { row.SerpApiKey = patch.SerpApiKey; changed = true; }
        if (patch.GoogleRichResultsApiKey is not null) { row.GoogleRichResultsApiKey = patch.GoogleRichResultsApiKey; changed = true; }
        if (patch.CrawlAuthPassword is not null) { row.CrawlAuthPassword = patch.CrawlAuthPassword; changed = true; }
        if (patch.CrawlCookies is not null) { row.CrawlCookies = patch.CrawlCookies; changed = true; }
        if (!changed)
        {
            return;
        }

        row.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
    }
}

public sealed class McpSettingsRepository(AiDbContext db, IMemoryCache cache) : IMcpSettingsRepository
{
    private const long SingletonId = 1;

    public async Task<McpSettings> LoadAsync(CancellationToken cancellationToken = default)
    {
        var row = await db.McpSettings.AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == SingletonId, cancellationToken);
        return row is null
            ? new McpSettings()
            : new McpSettings
            {
                BearerToken = row.BearerToken,
                AllowedHosts = row.AllowedHosts,
                AllowedOrigins = row.AllowedOrigins,
                PublicUrl = row.PublicUrl,
                ToolBundle = string.IsNullOrWhiteSpace(row.ToolBundle) ? "core" : row.ToolBundle,
                DisabledTools = row.DisabledTools,
                EnabledDomains = string.IsNullOrWhiteSpace(row.EnabledDomains)
                    ? "[\"core\",\"insight\"]"
                    : row.EnabledDomains,
            };
    }

    public async Task MergeAsync(McpSettingsPatch patch, CancellationToken cancellationToken = default)
    {
        var row = await db.McpSettings.AsTracking()
            .FirstOrDefaultAsync(x => x.Id == SingletonId, cancellationToken);
        if (row is null)
        {
            return;
        }

        var changed = false;
        if (patch.BearerToken is not null) { row.BearerToken = patch.BearerToken; changed = true; }
        if (patch.AllowedHosts is not null) { row.AllowedHosts = patch.AllowedHosts; changed = true; }
        if (patch.AllowedOrigins is not null) { row.AllowedOrigins = patch.AllowedOrigins; changed = true; }
        if (patch.PublicUrl is not null) { row.PublicUrl = patch.PublicUrl; changed = true; }
        if (patch.ToolBundle is not null) { row.ToolBundle = patch.ToolBundle; changed = true; }
        if (patch.DisabledTools is not null) { row.DisabledTools = patch.DisabledTools; changed = true; }
        if (patch.EnabledDomains is not null) { row.EnabledDomains = patch.EnabledDomains; changed = true; }
        if (!changed)
        {
            return;
        }

        row.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(cancellationToken);

        if (patch.BearerToken is not null)
        {
            cache.Remove(McpAuthCacheKeys.BearerToken);
        }
    }
}

public sealed class FeatureFlagsRepository(AiDbContext db) : IFeatureFlagsRepository
{
    private const long SingletonId = 1;

    public async Task<FeatureFlags> LoadAsync(CancellationToken cancellationToken = default)
    {
        var row = await db.FeatureFlags.AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == SingletonId, cancellationToken);
        return row is null
            ? new FeatureFlags()
            : new FeatureFlags
            {
                PipelineEnabled = row.PipelineEnabled,
                WriteEnabled = row.WriteEnabled,
                PagesMdEnabled = row.PagesMdEnabled,
                ChatEnabled = row.ChatEnabled,
                McpVisible = row.McpVisible,
                SecretsVisible = row.SecretsVisible,
            };
    }

    public async Task MergeAsync(FeatureFlagsPatch patch, CancellationToken cancellationToken = default)
    {
        var row = await db.FeatureFlags.AsTracking()
            .FirstOrDefaultAsync(x => x.Id == SingletonId, cancellationToken);
        if (row is null)
        {
            return;
        }

        var changed = false;
        if (patch.PipelineEnabled is not null) { row.PipelineEnabled = patch.PipelineEnabled.Value; changed = true; }
        if (patch.WriteEnabled is not null) { row.WriteEnabled = patch.WriteEnabled.Value; changed = true; }
        if (patch.PagesMdEnabled is not null) { row.PagesMdEnabled = patch.PagesMdEnabled.Value; changed = true; }
        if (patch.ChatEnabled is not null) { row.ChatEnabled = patch.ChatEnabled.Value; changed = true; }
        if (patch.McpVisible is not null) { row.McpVisible = patch.McpVisible.Value; changed = true; }
        if (patch.SecretsVisible is not null) { row.SecretsVisible = patch.SecretsVisible.Value; changed = true; }
        if (!changed)
        {
            return;
        }

        row.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
    }
}
