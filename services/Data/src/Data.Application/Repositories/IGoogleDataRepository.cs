using System.Text.Json.Nodes;

namespace Data.Application.Repositories;

public interface IGoogleDataRepository
{
    /// <summary>
    /// Latest saved Google snapshot for a property, payload-safe (no gsc_full / ga4_full).
    /// </summary>
    Task<JsonObject?> GetLatestPayloadAsync(long? propertyId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Page-level GSC summaries from the latest snapshot's <c>gsc_full.by_page</c>.
    /// </summary>
    Task<JsonObject?> GetGscDetailAsync(long? propertyId, CancellationToken cancellationToken = default);
}
