using System.Text.Json.Nodes;

namespace Data.Application.Report;

public interface IReportSectionService
{
    /// <summary>
    /// Returns a section slice of report payload, with sidecar merges (e.g. google_data for traffic).
    /// </summary>
    Task<JsonObject?> GetSectionPayloadAsync(
        long? reportId,
        string? domain,
        string section,
        CancellationToken cancellationToken = default);
}
