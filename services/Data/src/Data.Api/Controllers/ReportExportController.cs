using System.Text;
using MediaTypeNames = System.Net.Mime.MediaTypeNames;
using Data.Application.Services;
using Data.Domain.Models;
using Microsoft.AspNetCore.Mvc;
using WebsiteProfiling.Contracts.Report;

namespace Data.Api.Controllers;

/// <summary>
/// PDF/Excel/CSV/JSON/sitemap report export — absorbed from the former FileService. Route prefix
/// and query params are unchanged so the BFF's export path-builders (<c>BuildFileServiceReportPath</c>
/// / <c>BuildFileServiceWorkbookPath</c>) need no changes beyond retargeting to the Data client.
/// </summary>
[ApiController]
[Route(ReportExportRoutes.V1ReportsPrefix)]
[Tags("Export")]
public sealed class ReportExportController(
    IPdfReportService pdfService,
    IWorkbookReportService workbookService,
    IReportExportService exportService) : ControllerBase
{
    [HttpGet("{reportId:int}/pdf")]
    public async Task<IActionResult> GetPdfById(
        int reportId, string? profile, string? disposition, bool? branding, CancellationToken cancellationToken)
    {
        var pdfProfile = ParseProfile(profile);
        var useBranding = branding ?? true;
        try
        {
            var bytes = await pdfService.GenerateByReportIdAsync(reportId, pdfProfile, useBranding, cancellationToken);
            return PdfResult(bytes, disposition, $"audit-report-{reportId}.pdf");
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { detail = ex.Message });
        }
        catch (HttpRequestException ex)
        {
            return StatusCode(502, new { detail = "Upstream data service unavailable", error = ex.Message });
        }
    }

    [HttpGet("by-domain/{domain}/pdf")]
    public async Task<IActionResult> GetPdfByDomain(
        string domain, string? profile, string? disposition, bool? branding, CancellationToken cancellationToken)
    {
        var pdfProfile = ParseProfile(profile);
        var useBranding = branding ?? true;
        try
        {
            var bytes = await pdfService.GenerateByDomainAsync(domain, pdfProfile, useBranding, cancellationToken);
            return PdfResult(bytes, disposition, $"audit-report-{SafeName(domain)}.pdf");
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { detail = ex.Message });
        }
        catch (HttpRequestException ex)
        {
            return StatusCode(502, new { detail = "Upstream data service unavailable", error = ex.Message });
        }
    }

    [HttpGet("{reportId:int}/workbook")]
    public async Task<IActionResult> GetWorkbookById(int reportId, string? disposition, CancellationToken cancellationToken)
    {
        try
        {
            var bytes = await workbookService.GenerateByReportIdAsync(reportId, cancellationToken);
            return WorkbookResult(bytes, disposition, $"audit-workbook-{reportId}.xlsx");
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { detail = ex.Message });
        }
        catch (HttpRequestException ex)
        {
            return StatusCode(502, new { detail = "Upstream data service unavailable", error = ex.Message });
        }
    }

    [HttpGet("by-domain/{domain}/workbook")]
    public async Task<IActionResult> GetWorkbookByDomain(string domain, string? disposition, CancellationToken cancellationToken)
    {
        try
        {
            var bytes = await workbookService.GenerateByDomainAsync(domain, cancellationToken);
            return WorkbookResult(bytes, disposition, $"audit-workbook-{SafeName(domain)}.xlsx");
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { detail = ex.Message });
        }
        catch (HttpRequestException ex)
        {
            return StatusCode(502, new { detail = "Upstream data service unavailable", error = ex.Message });
        }
    }

    [HttpGet("{reportId:int}/csv")]
    public Task<IActionResult> GetCsvById(int reportId, string? disposition, CancellationToken ct) =>
        ExportText(() => exportService.GetCsvByReportIdAsync(reportId, ct), MediaTypeNames.Text.Csv, disposition, $"report-{reportId}.csv");

    [HttpGet("by-domain/{domain}/csv")]
    public Task<IActionResult> GetCsvByDomain(string domain, string? disposition, CancellationToken ct) =>
        ExportText(() => exportService.GetCsvByDomainAsync(domain, ct), MediaTypeNames.Text.Csv, disposition, $"report-{SafeName(domain)}.csv");

    [HttpGet("{reportId:int}/json")]
    public Task<IActionResult> GetJsonById(int reportId, string? disposition, CancellationToken ct) =>
        ExportText(() => exportService.GetJsonByReportIdAsync(reportId, ct), MediaTypeNames.Application.Json, disposition, $"report-{reportId}.json");

    [HttpGet("by-domain/{domain}/json")]
    public Task<IActionResult> GetJsonByDomain(string domain, string? disposition, CancellationToken ct) =>
        ExportText(() => exportService.GetJsonByDomainAsync(domain, ct), MediaTypeNames.Application.Json, disposition, $"report-{SafeName(domain)}.json");

    [HttpGet("{reportId:int}/sitemap")]
    public Task<IActionResult> GetSitemapById(int reportId, string? disposition, CancellationToken ct) =>
        ExportText(() => exportService.GetSitemapByReportIdAsync(reportId, ct), MediaTypeNames.Application.Xml, disposition, $"sitemap-{reportId}.xml");

    [HttpGet("by-domain/{domain}/sitemap")]
    public Task<IActionResult> GetSitemapByDomain(string domain, string? disposition, CancellationToken ct) =>
        ExportText(() => exportService.GetSitemapByDomainAsync(domain, ct), MediaTypeNames.Application.Xml, disposition, $"sitemap-{SafeName(domain)}.xml");

    private static async Task<IActionResult> ExportText(
        Func<Task<string>> render, string contentType, string? disposition, string filename)
    {
        try
        {
            var text = await render();
            var inline = string.Equals(disposition, ContentDisposition.Inline, StringComparison.OrdinalIgnoreCase);
            var contentDisposition = inline ? ContentDisposition.Inline : $"{ContentDisposition.Attachment}; filename=\"{filename}\"";
            return new BinaryFileActionResult(Encoding.UTF8.GetBytes(text), contentType, contentDisposition);
        }
        catch (KeyNotFoundException ex)
        {
            return new NotFoundObjectResult(new { detail = ex.Message });
        }
        catch (HttpRequestException ex)
        {
            return new ObjectResult(new { detail = "Upstream data service unavailable", error = ex.Message }) { StatusCode = 502 };
        }
    }

    private static string SafeName(string? domain) =>
        string.IsNullOrWhiteSpace(domain) ? "report" : domain.Replace('.', '-');

    private static PdfProfile ParseProfile(string? profile) => (profile ?? PdfProfiles.Standard).Trim().ToLowerInvariant() switch
    {
        PdfProfiles.Executive => PdfProfile.Executive,
        PdfProfiles.Full => PdfProfile.Full,
        PdfProfiles.Premium => PdfProfile.Premium,
        _ => PdfProfile.Standard,
    };

    private static IActionResult PdfResult(byte[] bytes, string? disposition, string filename)
    {
        var inline = string.Equals(disposition, ContentDisposition.Inline, StringComparison.OrdinalIgnoreCase);
        var contentDisposition = inline ? ContentDisposition.Inline : $"{ContentDisposition.Attachment}; filename=\"{filename}\"";
        return new BinaryFileActionResult(bytes, MediaTypeNames.Application.Pdf, contentDisposition);
    }

    private static IActionResult WorkbookResult(byte[] bytes, string? disposition, string filename)
    {
        var inline = string.Equals(disposition, ContentDisposition.Inline, StringComparison.OrdinalIgnoreCase);
        var contentDisposition = inline ? ContentDisposition.Inline : $"{ContentDisposition.Attachment}; filename=\"{filename}\"";
        return new BinaryFileActionResult(
            bytes,
            ReportExportMimeTypes.Xlsx,
            contentDisposition);
    }
}
