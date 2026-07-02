using System.Text.Json;
using Data.Domain.Models;

namespace Data.Application.Clients;

public interface IReportDataClient
{
    Task<IReadOnlyList<ReportListRow>> ListReportsAsync(CancellationToken cancellationToken = default);
    Task<JsonElement?> GetPayloadAsync(int reportId, CancellationToken cancellationToken = default);
}
