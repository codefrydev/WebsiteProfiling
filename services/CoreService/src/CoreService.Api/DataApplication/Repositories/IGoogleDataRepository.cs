using System.Text.Json.Nodes;
using WebsiteProfiling.Contracts.Google;

namespace CoreService.Api.DataApplication.Repositories;

public interface IGoogleDataRepository
{
    /// <summary>
    /// Latest saved Google snapshot for a property, payload-safe (no gsc_full / ga4_full).
    /// </summary>
    Task<JsonObject?> GetLatestPayloadAsync(long? propertyId, CancellationToken cancellationToken = default);

    /// <summary>Typed view of <see cref="GetLatestPayloadAsync"/>.</summary>
    Task<GoogleSlice?> GetLatestGoogleSliceAsync(long? propertyId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Page-level GSC summaries from the latest snapshot's <c>gsc_full.by_page</c>.
    /// </summary>
    Task<JsonObject?> GetGscDetailAsync(long? propertyId, CancellationToken cancellationToken = default);

    /// <summary>Typed page-level GSC detail keyed by page URL.</summary>
    Task<Dictionary<string, GscPageDetail>?> GetGscDetailByPageAsync(
        long? propertyId,
        CancellationToken cancellationToken = default);
}
