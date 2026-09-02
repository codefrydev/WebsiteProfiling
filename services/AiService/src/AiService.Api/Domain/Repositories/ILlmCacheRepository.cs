namespace AiService.Api.Domain.Repositories;

public interface ILlmCacheRepository
{
    Task<string?> ReadAsync(string cacheKey, CancellationToken cancellationToken = default);

    Task WriteAsync(string cacheKey, string responseJson, CancellationToken cancellationToken = default);

    Task<IReadOnlyDictionary<string, string>> ReadBatchAsync(
        IReadOnlyList<string> cacheKeys,
        CancellationToken cancellationToken = default);
}
