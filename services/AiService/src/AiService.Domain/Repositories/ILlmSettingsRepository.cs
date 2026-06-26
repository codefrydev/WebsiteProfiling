using AiService.Domain.Models;

namespace AiService.Domain.Repositories;

public interface ILlmSettingsRepository
{
    Task<LlmSettings> LoadAsync(CancellationToken cancellationToken = default);

    Task<LlmSettings> LoadForClientAsync(CancellationToken cancellationToken = default);

    Task MergeAsync(LlmSettingsPatch patch, CancellationToken cancellationToken = default);

    Task MergeProviderApiKeyAsync(
        string provider,
        string? apiKey,
        CancellationToken cancellationToken = default);
}
