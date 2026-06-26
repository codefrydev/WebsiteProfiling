using AiService.Domain.Models;

namespace AiService.Domain.Repositories;

public interface IIntegrationSecretsRepository
{
    Task<IntegrationSecrets> LoadAsync(CancellationToken cancellationToken = default);

    Task MergeAsync(IntegrationSecretsPatch patch, CancellationToken cancellationToken = default);
}

public interface IMcpSettingsRepository
{
    Task<McpSettings> LoadAsync(CancellationToken cancellationToken = default);

    Task MergeAsync(McpSettingsPatch patch, CancellationToken cancellationToken = default);
}

public interface IFeatureFlagsRepository
{
    Task<FeatureFlags> LoadAsync(CancellationToken cancellationToken = default);

    Task MergeAsync(FeatureFlagsPatch patch, CancellationToken cancellationToken = default);
}
