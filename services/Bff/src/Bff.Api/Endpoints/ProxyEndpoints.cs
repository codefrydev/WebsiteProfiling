using Bff.Api.Forwarding;
using Bff.Application;
using Bff.Application.Options;
using Microsoft.Extensions.Options;

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
        // Chat: Server-Sent Events stream to AiService (or FastAPI when AI_ROUTES is empty).
        app.MapPost("/api/chat", (HttpContext ctx) =>
        {
            var upstream = ctx.RequestServices.GetRequiredService<IOptions<UpstreamOptions>>().Value;
            var useAi = upstream.AiRoutes.Any(prefix =>
                "/api/chat".StartsWith(prefix.TrimEnd('/'), StringComparison.OrdinalIgnoreCase)
                || prefix.Equals("/api/chat", StringComparison.OrdinalIgnoreCase));
            var client = useAi ? DependencyInjection.AiStreamClient : DependencyInjection.FastApiStreamClient;
            var path = useAi ? $"/api/chat/{ctx.Request.QueryString}" : $"/api/chat/{ctx.Request.QueryString}";
            return (IResult)new ForwardingResult(client, path, disableResponseBuffering: true);
        });

        // Report export: PDF/CSV/JSON are all rendered by the FileService (which reads Postgres
        // directly). A missing format defaults to csv (matches the old Python default); any other
        // format is rejected (the Python export route has been removed). Mirrors proxyToFileService.ts.
        app.MapGet("/api/report/export", (HttpContext ctx) =>
        {
            var raw = ctx.Request.Query["format"].ToString();
            var format = string.IsNullOrEmpty(raw) ? "csv" : raw.ToLowerInvariant();
            if (format is not ("pdf" or "csv" or "json"))
            {
                return Results.Json(
                    new { error = $"Unsupported export format '{format}'. Use pdf, csv, or json." },
                    statusCode: 400);
            }
            var path = BuildFileServiceReportPath(ctx.Request.Query, format);
            return path is null
                ? Results.Json(new { error = "reportId or domain required for export" }, statusCode: 400)
                : (IResult)new ForwardingResult(DependencyInjection.FileServiceClient, path, disableResponseBuffering: true);
        });

        // Excel workbook export -> FileService. Mirrors proxyToFileService.ts.
        app.MapGet("/api/report/export-workbook", (HttpContext ctx) =>
        {
            var path = BuildFileServiceWorkbookPath(ctx.Request.Query);
            return path is null
                ? Results.Json(new { error = "reportId or domain required for workbook export" }, statusCode: 400)
                : (IResult)new ForwardingResult(DependencyInjection.FileServiceClient, path, disableResponseBuffering: true);
        });

        // Sitemap export -> FileService (was Python via the catch-all; now rendered from Postgres).
        app.MapGet("/api/report/export-sitemap", (HttpContext ctx) =>
        {
            var path = BuildFileServiceReportPath(ctx.Request.Query, "sitemap");
            return path is null
                ? Results.Json(new { error = "reportId or domain required for sitemap export" }, statusCode: 400)
                : (IResult)new ForwardingResult(DependencyInjection.FileServiceClient, path, disableResponseBuffering: true);
        });

        // Catch-all: every other /api/* request -> FastAPI (streamed for remaining export routes),
        // except paths in the DATA_ROUTES allowlist, which go to the internal Data service
        // (GET reads + POST/PUT/DELETE mutations on matched prefixes).
        // Auth still runs in AccessControlMiddleware before this delegate, so routing here doesn't
        // change which roles may reach a path. Empty allowlist => nothing matches => all FastAPI.
        app.Map("/api/{**rest}", (HttpContext ctx) =>
        {
            var path = ctx.Request.Path.Value ?? string.Empty;
            var streaming = path.Contains("/export", StringComparison.OrdinalIgnoreCase);

            var upstream = ctx.RequestServices.GetRequiredService<IOptions<UpstreamOptions>>().Value;
            var matchesDataRoute = upstream.DataRoutes.Any(prefix =>
                path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase));
            var matchesIntegrationsRoute = MatchesIntegrationsRoute(path, upstream.IntegrationsRoutes);
            var matchesReportRoute = upstream.ReportRoutes.Any(prefix =>
                path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase));
            var matchesConfigRoute = upstream.ConfigRoutes.Any(prefix =>
                path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase));
            var matchesAiRoute = upstream.AiRoutes.Any(prefix =>
                path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase));
            var toData = !streaming
                && matchesDataRoute
                && (HttpMethods.IsGet(ctx.Request.Method)
                    || HttpMethods.IsHead(ctx.Request.Method)
                    || HttpMethods.IsPost(ctx.Request.Method)
                    || HttpMethods.IsPut(ctx.Request.Method)
                    || HttpMethods.IsDelete(ctx.Request.Method));
            var toIntegrations = !streaming
                && !toData
                && matchesIntegrationsRoute
                && (HttpMethods.IsGet(ctx.Request.Method)
                    || HttpMethods.IsHead(ctx.Request.Method)
                    || HttpMethods.IsPost(ctx.Request.Method)
                    || HttpMethods.IsPut(ctx.Request.Method)
                    || HttpMethods.IsPatch(ctx.Request.Method)
                    || HttpMethods.IsDelete(ctx.Request.Method));
            var toReport = !streaming
                && !toData
                && !toIntegrations
                && matchesReportRoute
                && (HttpMethods.IsGet(ctx.Request.Method)
                    || HttpMethods.IsHead(ctx.Request.Method)
                    || HttpMethods.IsPost(ctx.Request.Method)
                    || HttpMethods.IsPut(ctx.Request.Method)
                    || HttpMethods.IsDelete(ctx.Request.Method));
            var toConfig = !streaming
                && !toData
                && !toIntegrations
                && !toReport
                && matchesConfigRoute
                && (HttpMethods.IsGet(ctx.Request.Method)
                    || HttpMethods.IsHead(ctx.Request.Method)
                    || HttpMethods.IsPost(ctx.Request.Method)
                    || HttpMethods.IsPut(ctx.Request.Method)
                    || HttpMethods.IsDelete(ctx.Request.Method));
            var toAi = !streaming
                && !toData
                && !toIntegrations
                && !toReport
                && !toConfig
                && matchesAiRoute
                && (HttpMethods.IsGet(ctx.Request.Method)
                    || HttpMethods.IsHead(ctx.Request.Method)
                    || HttpMethods.IsPost(ctx.Request.Method)
                    || HttpMethods.IsPut(ctx.Request.Method)
                    || HttpMethods.IsDelete(ctx.Request.Method));

            var client = toData
                ? DependencyInjection.DataClient
                : toIntegrations
                    ? DependencyInjection.IntegrationsClient
                    : toReport
                        ? DependencyInjection.ReportClient
                        : toConfig
                            ? DependencyInjection.ConfigClient
                            : toAi
                                ? DependencyInjection.AiClient
                                : streaming ? DependencyInjection.FastApiStreamClient : DependencyInjection.FastApiClient;

            return (IResult)new ForwardingResult(
                client,
                $"{ctx.Request.Path}{ctx.Request.QueryString}",
                disableResponseBuffering: streaming);
        });
    }

    // Builds the FileService path for a report export. pdf carries profile/branding; csv/json/sitemap
    // only need disposition. Returns null when neither reportId nor domain is supplied.
    private static string? BuildFileServiceReportPath(IQueryCollection query, string format)
    {
        var reportId = query["reportId"].ToString();
        var domain = query["domain"].ToString();
        var disposition = Defaulted(query["disposition"].ToString(), "attachment");

        string qs;
        if (format == "pdf")
        {
            var profile = Defaulted(query["profile"].ToString(), "standard");
            var branding = Defaulted(query["branding"].ToString(), "true");
            qs = $"?profile={Uri.EscapeDataString(profile)}&disposition={Uri.EscapeDataString(disposition)}&branding={Uri.EscapeDataString(branding)}";
        }
        else
        {
            qs = $"?disposition={Uri.EscapeDataString(disposition)}";
        }

        if (!string.IsNullOrEmpty(reportId))
        {
            return $"/v1/reports/{Uri.EscapeDataString(reportId)}/{format}{qs}";
        }
        if (!string.IsNullOrEmpty(domain))
        {
            return $"/v1/reports/by-domain/{Uri.EscapeDataString(domain)}/{format}{qs}";
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

    private static bool MatchesIntegrationsRoute(string path, string[] routes)
    {
        if (routes.Length == 0)
        {
            return false;
        }

        foreach (var prefix in routes)
        {
            if (path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return path.StartsWith("/api/properties/", StringComparison.OrdinalIgnoreCase)
            && path.Contains("/google", StringComparison.OrdinalIgnoreCase);
    }
}
