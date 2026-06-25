using AiService.Domain.Entities;

namespace AiService.Domain.Repositories;

public interface ILlmConfigRepository
{
    Task<IReadOnlyDictionary<string, string>> LoadAsync(CancellationToken cancellationToken = default);

    Task<IReadOnlyList<LlmConfigEntry>> LoadFullAsync(CancellationToken cancellationToken = default);

    Task SaveAsync(IReadOnlyDictionary<string, string> entries, CancellationToken cancellationToken = default);
}
