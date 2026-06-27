using System.Text;
using FileService.Api;
using FileService.Application;
using FileService.Application.Services;
using FileService.Domain.Models;
using Microsoft.OpenApi;

var builder = WebApplication.CreateBuilder(args);

builder.Host.UseDefaultServiceProvider((_, options) =>
{
    options.ValidateOnBuild = true;
    options.ValidateScopes = true;
});

builder.Services.AddFileServiceApplication();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "FileService API",
        Version = "v1",
        Description =
            "PDF export and file generation for Site Audit reports. "
            + "Fetches report data from the Site Audit report API over HTTP; no direct database access.",
    });
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(options =>
    {
        options.SwaggerEndpoint("/swagger/v1/swagger.json", "FileService API v1");
        options.RoutePrefix = "docs";
    });
}

app.MapGet("/health", () => Results.Ok(new { status = "ok" }))
    .WithName("HealthCheck")
    .WithTags("Health")
    .WithSummary("Liveness probe")
    .WithDescription("Returns ok when the service is running.");

app.MapGet("/v1/reports/{reportId:int}/pdf", async (
    int reportId,
    IPdfReportService pdfService,
    string? profile,
    string? disposition,
    bool? branding,
    CancellationToken cancellationToken) =>
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
        return Results.NotFound(new { detail = ex.Message });
    }
    catch (HttpRequestException ex)
    {
        return Results.Json(new { detail = "Upstream data service unavailable", error = ex.Message }, statusCode: 502);
    }
})
.WithName("GetReportPdfById")
.WithPdfOpenApi(
    "Export report PDF by ID",
    "Generates a QuestPDF audit report for the given report ID. "
    + "Query params: profile (executive|standard|full|premium, default standard), "
    + "branding (default true), disposition (inline|attachment, default attachment).");

app.MapGet("/v1/reports/by-domain/{domain}/pdf", async (
    string domain,
    IPdfReportService pdfService,
    string? profile,
    string? disposition,
    bool? branding,
    CancellationToken cancellationToken) =>
{
    var pdfProfile = ParseProfile(profile);
    var useBranding = branding ?? true;
    try
    {
        var bytes = await pdfService.GenerateByDomainAsync(domain, pdfProfile, useBranding, cancellationToken);
        var safeName = string.IsNullOrWhiteSpace(domain) ? "report" : domain.Replace('.', '-');
        return PdfResult(bytes, disposition, $"audit-report-{safeName}.pdf");
    }
    catch (KeyNotFoundException ex)
    {
        return Results.NotFound(new { detail = ex.Message });
    }
    catch (HttpRequestException ex)
    {
        return Results.Json(new { detail = "Upstream data service unavailable", error = ex.Message }, statusCode: 502);
    }
})
.WithName("GetReportPdfByDomain")
.WithPdfOpenApi(
    "Export report PDF by domain",
    "Resolves the latest report for the domain, then generates a QuestPDF audit report. "
    + "Query params: profile (executive|standard|full|premium, default standard), "
    + "branding (default true), disposition (inline|attachment, default attachment).");

app.MapGet("/v1/reports/{reportId:int}/workbook", async (
    int reportId,
    IWorkbookReportService workbookService,
    string? disposition,
    CancellationToken cancellationToken) =>
{
    try
    {
        var bytes = await workbookService.GenerateByReportIdAsync(reportId, cancellationToken);
        return WorkbookResult(bytes, disposition, $"audit-workbook-{reportId}.xlsx");
    }
    catch (KeyNotFoundException ex)
    {
        return Results.NotFound(new { detail = ex.Message });
    }
    catch (HttpRequestException ex)
    {
        return Results.Json(new { detail = "Upstream data service unavailable", error = ex.Message }, statusCode: 502);
    }
})
.WithName("GetReportWorkbookById")
.WithWorkbookOpenApi(
    "Export crawl workbook by report ID",
    "Generates an Excel workbook (Internal URLs, Links, Redirects, Issues, Custom Fields) "
    + "from the report payload fetched via the report API. disposition: inline|attachment (default attachment).");

app.MapGet("/v1/reports/by-domain/{domain}/workbook", async (
    string domain,
    IWorkbookReportService workbookService,
    string? disposition,
    CancellationToken cancellationToken) =>
{
    try
    {
        var bytes = await workbookService.GenerateByDomainAsync(domain, cancellationToken);
        var safeName = string.IsNullOrWhiteSpace(domain) ? "report" : domain.Replace('.', '-');
        return WorkbookResult(bytes, disposition, $"audit-workbook-{safeName}.xlsx");
    }
    catch (KeyNotFoundException ex)
    {
        return Results.NotFound(new { detail = ex.Message });
    }
    catch (HttpRequestException ex)
    {
        return Results.Json(new { detail = "Upstream data service unavailable", error = ex.Message }, statusCode: 502);
    }
})
.WithName("GetReportWorkbookByDomain")
.WithWorkbookOpenApi(
    "Export crawl workbook by domain",
    "Resolves the latest report for the domain, then generates an Excel crawl workbook.");

// ── CSV / JSON / sitemap exports (migrated from the Python report API) ──────────
// All three render from the report payload read directly from Postgres.

app.MapGet("/v1/reports/{reportId:int}/csv", (int reportId, IReportExportService export, string? disposition, CancellationToken ct) =>
    ExportText(() => export.GetCsvByReportIdAsync(reportId, ct), "text/csv", disposition, $"report-{reportId}.csv"))
    .WithName("GetReportCsvById").WithTags("Export");

app.MapGet("/v1/reports/by-domain/{domain}/csv", (string domain, IReportExportService export, string? disposition, CancellationToken ct) =>
    ExportText(() => export.GetCsvByDomainAsync(domain, ct), "text/csv", disposition, $"report-{SafeName(domain)}.csv"))
    .WithName("GetReportCsvByDomain").WithTags("Export");

app.MapGet("/v1/reports/{reportId:int}/json", (int reportId, IReportExportService export, string? disposition, CancellationToken ct) =>
    ExportText(() => export.GetJsonByReportIdAsync(reportId, ct), "application/json", disposition, $"report-{reportId}.json"))
    .WithName("GetReportJsonById").WithTags("Export");

app.MapGet("/v1/reports/by-domain/{domain}/json", (string domain, IReportExportService export, string? disposition, CancellationToken ct) =>
    ExportText(() => export.GetJsonByDomainAsync(domain, ct), "application/json", disposition, $"report-{SafeName(domain)}.json"))
    .WithName("GetReportJsonByDomain").WithTags("Export");

app.MapGet("/v1/reports/{reportId:int}/sitemap", (int reportId, IReportExportService export, string? disposition, CancellationToken ct) =>
    ExportText(() => export.GetSitemapByReportIdAsync(reportId, ct), "application/xml", disposition, $"sitemap-{reportId}.xml"))
    .WithName("GetReportSitemapById").WithTags("Export");

app.MapGet("/v1/reports/by-domain/{domain}/sitemap", (string domain, IReportExportService export, string? disposition, CancellationToken ct) =>
    ExportText(() => export.GetSitemapByDomainAsync(domain, ct), "application/xml", disposition, $"sitemap-{SafeName(domain)}.xml"))
    .WithName("GetReportSitemapByDomain").WithTags("Export");

app.Run();

static async Task<IResult> ExportText(Func<Task<string>> render, string contentType, string? disposition, string filename)
{
    try
    {
        var text = await render();
        var inline = string.Equals(disposition, "inline", StringComparison.OrdinalIgnoreCase);
        var contentDisposition = inline ? "inline" : $"attachment; filename=\"{filename}\"";
        return new BinaryFileResult(Encoding.UTF8.GetBytes(text), contentType, contentDisposition);
    }
    catch (KeyNotFoundException ex)
    {
        return Results.NotFound(new { detail = ex.Message });
    }
    catch (HttpRequestException ex)
    {
        return Results.Json(new { detail = "Upstream data service unavailable", error = ex.Message }, statusCode: 502);
    }
}

static string SafeName(string? domain) =>
    string.IsNullOrWhiteSpace(domain) ? "report" : domain.Replace('.', '-');

static PdfProfile ParseProfile(string? profile) => (profile ?? "standard").Trim().ToLowerInvariant() switch
{
    "executive" => PdfProfile.Executive,
    "full" => PdfProfile.Full,
    "premium" => PdfProfile.Premium,
    _ => PdfProfile.Standard,
};

static IResult PdfResult(byte[] bytes, string? disposition, string filename)
{
    var inline = string.Equals(disposition, "inline", StringComparison.OrdinalIgnoreCase);
    var contentDisposition = inline
        ? "inline"
        : $"attachment; filename=\"{filename}\"";
    return new PdfFileResult(bytes, contentDisposition);
}

static IResult WorkbookResult(byte[] bytes, string? disposition, string filename)
{
    var inline = string.Equals(disposition, "inline", StringComparison.OrdinalIgnoreCase);
    var contentDisposition = inline
        ? "inline"
        : $"attachment; filename=\"{filename}\"";
    return new BinaryFileResult(
        bytes,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        contentDisposition);
}

public partial class Program;
