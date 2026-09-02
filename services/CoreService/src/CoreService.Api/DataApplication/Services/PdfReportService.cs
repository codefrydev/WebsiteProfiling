using CoreService.Api.DataApplication.Clients;
using CoreService.Api.DataApplication.Domain;
using CoreService.Api.DataApplication.Mapping;
using CoreService.Api.Domain.Data.Models;
using CoreService.Api.Rendering;
using CoreService.Api.Rendering.Composition;

namespace CoreService.Api.DataApplication.Services;

public interface IPdfReportService
{
    Task<byte[]> GenerateByReportIdAsync(
        int reportId,
        PdfProfile profile,
        bool branding,
        CancellationToken cancellationToken = default);

    Task<byte[]> GenerateByDomainAsync(
        string domain,
        PdfProfile profile,
        bool branding,
        CancellationToken cancellationToken = default);
}

public sealed class PdfReportService : IPdfReportService
{
    private readonly IReportDataClient _client;
    private readonly IAppSettingsClient _brandingClient;
    private readonly AuditPdfGenerator _generator;
    private readonly ILogger<PdfReportService> _logger;

    public PdfReportService(
        IReportDataClient client,
        IAppSettingsClient brandingClient,
        AuditPdfGenerator generator,
        ILogger<PdfReportService> logger)
    {
        _client = client;
        _brandingClient = brandingClient;
        _generator = generator;
        _logger = logger;
    }

    public async Task<byte[]> GenerateByReportIdAsync(
        int reportId,
        PdfProfile profile,
        bool branding,
        CancellationToken cancellationToken = default)
    {
        var payload = await _client.GetPayloadAsync(reportId, cancellationToken);
        if (payload is null)
        {
            throw new KeyNotFoundException($"Report {reportId} not found");
        }
        var brand = await _brandingClient.GetBrandingAsync(branding, cancellationToken);
        var model = AuditReportMapper.Map(payload.Value, reportId, profile, brand).WithTableOfContents(profile);
        return _generator.Generate(model, profile);
    }

    public async Task<byte[]> GenerateByDomainAsync(
        string domain,
        PdfProfile profile,
        bool branding,
        CancellationToken cancellationToken = default)
    {
        var reports = await _client.ListReportsAsync(cancellationToken);
        var reportId = DomainResolver.ResolveReportId(reports, domain);
        if (reportId is null)
        {
            throw new KeyNotFoundException($"No report found for domain '{domain}'");
        }
        return await GenerateByReportIdAsync(reportId.Value, profile, branding, cancellationToken);
    }
}
