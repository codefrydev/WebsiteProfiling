using System.Text.Json;
using FileService.Application.Clients;
using FileService.Application.Domain;
using FileService.Rendering.Exports;

namespace FileService.Application.Services;

public interface IReportExportService
{
    Task<string> GetCsvByReportIdAsync(int reportId, CancellationToken cancellationToken = default);
    Task<string> GetCsvByDomainAsync(string domain, CancellationToken cancellationToken = default);
    Task<string> GetJsonByReportIdAsync(int reportId, CancellationToken cancellationToken = default);
    Task<string> GetJsonByDomainAsync(string domain, CancellationToken cancellationToken = default);
    Task<string> GetSitemapByReportIdAsync(int reportId, CancellationToken cancellationToken = default);
    Task<string> GetSitemapByDomainAsync(string domain, CancellationToken cancellationToken = default);
}

/// <summary>
/// Renders CSV / JSON / sitemap exports from the report payload. Mirrors <see cref="WorkbookReportService"/>:
/// fetch the payload via <see cref="IReportDataClient"/> (now Postgres-backed), then hand it to the
/// matching exporter. Throws <see cref="KeyNotFoundException"/> when the report/domain has no payload.
/// </summary>
public sealed class ReportExportService(
    IReportDataClient client,
    ReportCsvExporter csv,
    ReportJsonExporter json,
    ReportSitemapExporter sitemap) : IReportExportService
{
    public Task<string> GetCsvByReportIdAsync(int reportId, CancellationToken cancellationToken = default) =>
        RenderByIdAsync(reportId, csv.Generate, cancellationToken);

    public Task<string> GetCsvByDomainAsync(string domain, CancellationToken cancellationToken = default) =>
        RenderByDomainAsync(domain, csv.Generate, cancellationToken);

    public Task<string> GetJsonByReportIdAsync(int reportId, CancellationToken cancellationToken = default) =>
        RenderByIdAsync(reportId, json.Generate, cancellationToken);

    public Task<string> GetJsonByDomainAsync(string domain, CancellationToken cancellationToken = default) =>
        RenderByDomainAsync(domain, json.Generate, cancellationToken);

    public Task<string> GetSitemapByReportIdAsync(int reportId, CancellationToken cancellationToken = default) =>
        RenderByIdAsync(reportId, p => sitemap.Generate(p), cancellationToken);

    public Task<string> GetSitemapByDomainAsync(string domain, CancellationToken cancellationToken = default) =>
        RenderByDomainAsync(domain, p => sitemap.Generate(p), cancellationToken);

    private async Task<string> RenderByIdAsync(int reportId, Func<JsonElement, string> render, CancellationToken ct)
    {
        var payload = await client.GetPayloadAsync(reportId, ct);
        if (payload is null)
        {
            throw new KeyNotFoundException($"Report {reportId} not found");
        }
        return render(payload.Value);
    }

    private async Task<string> RenderByDomainAsync(string domain, Func<JsonElement, string> render, CancellationToken ct)
    {
        var reports = await client.ListReportsAsync(ct);
        var reportId = DomainResolver.ResolveReportId(reports, domain);
        if (reportId is null)
        {
            throw new KeyNotFoundException($"No report found for domain '{domain}'");
        }
        return await RenderByIdAsync(reportId.Value, render, ct);
    }
}
