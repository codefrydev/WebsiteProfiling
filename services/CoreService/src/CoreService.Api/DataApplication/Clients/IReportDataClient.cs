using System.Text.Json;
using CoreService.Api.Domain.Data.Models;

namespace CoreService.Api.DataApplication.Clients;

public interface IReportDataClient
{
    Task<IReadOnlyList<ReportListRow>> ListReportsAsync(CancellationToken cancellationToken = default);
    Task<JsonElement?> GetPayloadAsync(int reportId, CancellationToken cancellationToken = default);
}
