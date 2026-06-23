using Bff.Api.Forwarding;
using Bff.Application;

namespace Bff.Api.Endpoints;

/// <summary>
/// The reverse-proxy surface: every /api/* request is mirrored to FastAPI, with explicit
/// handling for streaming (chat SSE) and for exports that translate to the FileService.
/// All near-identical 1:1 routes collapse into one catch-all instead of ~84 hand-written files.
/// </summary>
public static class ProxyEndpoints
{
    public static void MapProxyEndpoints(this IEndpointRouteBuilder app)
    {
        // Chat: Server-Sent Events stream to FastAPI (upstream route has a trailing slash).
        app.MapPost("/api/chat", (HttpContext ctx) => (IResult)new ForwardingResult(
            DependencyInjection.FastApiStreamClient,
            $"/api/chat/{ctx.Request.QueryString}",
            disableResponseBuffering: true));

        // PDF export: FileService when format=pdf, else FastAPI (csv/json). Mirrors proxyToFileService.ts.
        app.MapGet("/api/report/export", (HttpContext ctx) =>
        {
            var format = ctx.Request.Query["format"].ToString();
            if (string.Equals(format, "pdf", StringComparison.OrdinalIgnoreCase))
            {
                var path = BuildFileServicePdfPath(ctx.Request.Query);
                return path is null
                    ? Results.Json(new { error = "reportId or domain required for PDF export" }, statusCode: 400)
                    : new ForwardingResult(DependencyInjection.FileServiceClient, path, disableResponseBuffering: true);
            }
            return new ForwardingResult(
                DependencyInjection.FastApiStreamClient,
                $"/api/report/export{ctx.Request.QueryString}",
                disableResponseBuffering: true);
        });

        // Excel workbook export -> FileService. Mirrors proxyToFileService.ts.
        app.MapGet("/api/report/export-workbook", (HttpContext ctx) =>
        {
            var path = BuildFileServiceWorkbookPath(ctx.Request.Query);
            return path is null
                ? Results.Json(new { error = "reportId or domain required for workbook export" }, statusCode: 400)
                : (IResult)new ForwardingResult(DependencyInjection.FileServiceClient, path, disableResponseBuffering: true);
        });

        // Catch-all: every other /api/* request -> FastAPI (streamed for remaining export routes).
        app.Map("/api/{**rest}", (HttpContext ctx) =>
        {
            var streaming = ctx.Request.Path.Value?.Contains("/export", StringComparison.OrdinalIgnoreCase) == true;
            var client = streaming ? DependencyInjection.FastApiStreamClient : DependencyInjection.FastApiClient;
            return (IResult)new ForwardingResult(
                client,
                $"{ctx.Request.Path}{ctx.Request.QueryString}",
                disableResponseBuffering: streaming);
        });
    }

    private static string? BuildFileServicePdfPath(IQueryCollection query)
    {
        var reportId = query["reportId"].ToString();
        var domain = query["domain"].ToString();
        var profile = Defaulted(query["profile"].ToString(), "standard");
        var disposition = Defaulted(query["disposition"].ToString(), "attachment");
        var branding = Defaulted(query["branding"].ToString(), "true");
        var qs = $"?profile={Uri.EscapeDataString(profile)}&disposition={Uri.EscapeDataString(disposition)}&branding={Uri.EscapeDataString(branding)}";

        if (!string.IsNullOrEmpty(reportId))
        {
            return $"/v1/reports/{Uri.EscapeDataString(reportId)}/pdf{qs}";
        }
        if (!string.IsNullOrEmpty(domain))
        {
            return $"/v1/reports/by-domain/{Uri.EscapeDataString(domain)}/pdf{qs}";
        }
        return null;
    }

    private static string? BuildFileServiceWorkbookPath(IQueryCollection query)
    {
        var reportId = query["reportId"].ToString();
        var domain = query["domain"].ToString();
        var disposition = Defaulted(query["disposition"].ToString(), "attachment");
        var qs = $"?disposition={Uri.EscapeDataString(disposition)}";

        if (!string.IsNullOrEmpty(reportId))
        {
            return $"/v1/reports/{Uri.EscapeDataString(reportId)}/workbook{qs}";
        }
        if (!string.IsNullOrEmpty(domain))
        {
            return $"/v1/reports/by-domain/{Uri.EscapeDataString(domain)}/workbook{qs}";
        }
        return null;
    }

    private static string Defaulted(string value, string fallback) =>
        string.IsNullOrEmpty(value) ? fallback : value;
}
