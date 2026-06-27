using System.Text.Json;

namespace Data.Application.Repositories;

public interface IPropertiesCrudRepository
{
    Task<IReadOnlyList<Dictionary<string, object?>>> ListPublicAsync(CancellationToken cancellationToken);

    Task<long> UpsertByDomainAsync(
        string name,
        string canonicalDomain,
        string? siteUrl,
        CancellationToken cancellationToken);

    Task<long?> EnsureFromStartUrlAsync(string startUrl, CancellationToken cancellationToken);

    Task<long?> LookupIdFromStartUrlAsync(string startUrl, CancellationToken cancellationToken);

    Task<Dictionary<string, object?>?> GetByIdAsync(long propertyId, CancellationToken cancellationToken);

    Task<Dictionary<string, object?>?> GetByDomainAsync(string domain, CancellationToken cancellationToken);

    Task<bool> DeleteAsync(long propertyId, CancellationToken cancellationToken);

    Task<Dictionary<string, object?>?> GetOpsAsync(long propertyId, CancellationToken cancellationToken);

    Task UpdateOpsAsync(
        long propertyId,
        string? scheduleCron,
        string? alertWebhookUrl,
        string? alertEmail,
        CancellationToken cancellationToken);

    Task UpdateCrawlPresetAsync(long propertyId, string? preset, CancellationToken cancellationToken);

    Task AuthorizeCrawlAsync(long propertyId, CancellationToken cancellationToken);
}
