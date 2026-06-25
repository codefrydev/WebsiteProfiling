using System.Text.Json.Nodes;

namespace Data.Application.Repositories;

public interface IGoogleDataRepository
{
    /// <summary>
    /// Latest saved Google snapshot for a property, payload-safe (no gsc_full / ga4_full).
    /// </summary>
    Task<JsonObject?> GetLatestPayloadAsync(long? propertyId, CancellationToken cancellationToken = default);
}
