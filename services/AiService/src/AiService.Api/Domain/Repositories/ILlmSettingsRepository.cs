using AiService.Api.Domain.Models;

namespace AiService.Api.Domain.Repositories;

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
