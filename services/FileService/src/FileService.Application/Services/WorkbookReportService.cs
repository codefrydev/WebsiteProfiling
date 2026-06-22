using System.Text.Json;
using FileService.Application.Clients;
using FileService.Application.Domain;
using FileService.Rendering;
using Microsoft.Extensions.Logging;

namespace FileService.Application.Services;

public interface IWorkbookReportService
{
    Task<byte[]> GenerateByReportIdAsync(int reportId, CancellationToken cancellationToken = default);

    Task<byte[]> GenerateByDomainAsync(string domain, CancellationToken cancellationToken = default);
}

public sealed class WorkbookReportService : IWorkbookReportService
{
    private readonly IReportDataClient _client;
    private readonly AuditWorkbookGenerator _generator;
    private readonly ILogger<WorkbookReportService> _logger;

    public WorkbookReportService(
        IReportDataClient client,
        AuditWorkbookGenerator generator,
        ILogger<WorkbookReportService> logger)
    {
        _client = client;
        _generator = generator;
        _logger = logger;
    }

    public async Task<byte[]> GenerateByReportIdAsync(int reportId, CancellationToken cancellationToken = default)
    {
        var payload = await _client.GetPayloadAsync(reportId, cancellationToken);
        if (payload is null)
        {
            throw new KeyNotFoundException($"Report {reportId} not found");
        }

        _logger.LogDebug("Generating workbook for report {ReportId}", reportId);
        return _generator.Generate(payload.Value);
    }

    public async Task<byte[]> GenerateByDomainAsync(string domain, CancellationToken cancellationToken = default)
    {
        var reports = await _client.ListReportsAsync(cancellationToken);
        var reportId = DomainResolver.ResolveReportId(reports, domain);
        if (reportId is null)
        {
            throw new KeyNotFoundException($"No report found for domain '{domain}'");
        }

        return await GenerateByReportIdAsync(reportId.Value, cancellationToken);
    }
}
