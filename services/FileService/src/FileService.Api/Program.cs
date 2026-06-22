using FileService.Api;
using FileService.Application;
using FileService.Application.Services;
using FileService.Domain.Models;
using Microsoft.OpenApi;

var builder = WebApplication.CreateBuilder(args);

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
            + "Fetches report data from FastAPI; no direct database access.",
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

app.Run();

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

public partial class Program;
