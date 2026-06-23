using System.Text.Json;
using FileService.Domain.Models;

namespace FileService.Application.Clients;

public interface IReportDataClient
{
    Task<IReadOnlyList<ReportListRow>> ListReportsAsync(CancellationToken cancellationToken = default);
    Task<JsonElement?> GetPayloadAsync(int reportId, CancellationToken cancellationToken = default);
}
