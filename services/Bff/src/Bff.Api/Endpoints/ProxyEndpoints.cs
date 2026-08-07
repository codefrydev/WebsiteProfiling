using Bff.Api.Forwarding;
using Bff.Application;
using Bff.Application.Options;
using Microsoft.Extensions.Options;
using WebsiteProfiling.Contracts.Report;

namespace Bff.Api.Endpoints;

/// <summary>
/// The reverse-proxy surface: every /api/* request is mirrored to FastAPI, with explicit
/// handling for streaming (chat SSE) and for exports that translate to the Data service's
/// /v1/reports/* export routes. All near-identical 1:1 routes collapse into one catch-all
/// instead of ~84 hand-written files.
/// </summary>
public static class ProxyEndpoints
{
    public static void MapProxyEndpoints(this IEndpointRouteBuilder app)
    {
        // Chat: Server-Sent Events stream to AiService (or FastAPI when AI_ROUTES is empty).
        app.MapPost(BffRoutes.Chat, (HttpContext ctx) =>
        {
            var upstream = ctx.RequestServices.GetRequiredService<IOptions<UpstreamOptions>>().Value;
            var useAi = upstream.AiRoutes.Any(prefix =>
                BffRoutes.Chat.StartsWith(prefix.TrimEnd('/'), StringComparison.OrdinalIgnoreCase)
                || prefix.Equals(BffRoutes.Chat, StringComparison.OrdinalIgnoreCase));
            var client = useAi ? DependencyInjection.AiStreamClient : DependencyInjection.FastApiStreamClient;
            var path = $"/api/chat{ctx.Request.QueryString}";
            return (IResult)new ForwardingResult(client, path, disableResponseBuffering: true);
        });

        // Report export: PDF/CSV/JSON are all rendered by the Data service's ReportExportController
        // (which reads Postgres directly). A missing format defaults to csv (matches the old Python
        // default); any other format is rejected (the Python export route has been removed).
        app.MapGet(BffRoutes.ReportExport, (HttpContext ctx) =>
        {
            var raw = ctx.Request.Query[ReportExportRoutes.FormatParam].ToString();
            var format = string.IsNullOrEmpty(raw) ? ReportExportFormats.Csv : raw.ToLowerInvariant();
            if (!ReportExportFormats.ApiFormats.Contains(format))
            {
                return Results.Json(
                    new { error = $"Unsupported export format '{format}'. Use pdf, csv, or json." },
                    statusCode: 400);
            }
            var path = BuildReportExportPath(ctx.Request.Query, format);
            return path is null
                ? Results.Json(new { error = "reportId or domain required for export" }, statusCode: 400)
                : (IResult)new ForwardingResult(DependencyInjection.DataClient, path, disableResponseBuffering: true);
        });

        // Excel workbook export -> Data service's ReportExportController.
        app.MapGet(BffRoutes.ReportExportWorkbook, (HttpContext ctx) =>
        {
            var path = BuildWorkbookExportPath(ctx.Request.Query);
            return path is null
                ? Results.Json(new { error = "reportId or domain required for workbook export" }, statusCode: 400)
                : (IResult)new ForwardingResult(DependencyInjection.DataClient, path, disableResponseBuffering: true);
        });

        // Sitemap export -> Data service's ReportExportController (was Python via the catch-all;
        // now rendered from Postgres).
        app.MapGet(BffRoutes.ReportExportSitemap, (HttpContext ctx) =>
        {
            var path = BuildReportExportPath(ctx.Request.Query, ReportExportFormats.Sitemap);
            return path is null
                ? Results.Json(new { error = "reportId or domain required for sitemap export" }, statusCode: 400)
                : (IResult)new ForwardingResult(DependencyInjection.DataClient, path, disableResponseBuffering: true);
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
            var toAi = !streaming
                && !toData
                && !toIntegrations
                && !toReport
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
                        : toAi
                            ? DependencyInjection.AiClient
                            : streaming ? DependencyInjection.FastApiStreamClient : DependencyInjection.FastApiClient;

            return (IResult)new ForwardingResult(
                client,
                $"{ctx.Request.Path}{ctx.Request.QueryString}",
                disableResponseBuffering: streaming);
        });
    }

    // Builds the Data service export path for a report export. pdf carries profile/branding;
    // csv/json/sitemap only need disposition. Returns null when neither reportId nor domain is supplied.
    private static string? BuildReportExportPath(IQueryCollection query, string format)
    {
        var reportId = query[ReportExportRoutes.ReportIdParam].ToString();
        var domain = query[ReportExportRoutes.DomainParam].ToString();
        var disposition = Defaulted(query[ReportExportRoutes.DispositionParam].ToString(), ContentDisposition.Attachment);

        string qs;
        if (format == ReportExportFormats.Pdf)
        {
            var profile = Defaulted(query[ReportExportRoutes.ProfileParam].ToString(), PdfProfiles.Standard);
            var branding = Defaulted(query[ReportExportRoutes.BrandingParam].ToString(), "true");
            qs = $"?profile={Uri.EscapeDataString(profile)}&disposition={Uri.EscapeDataString(disposition)}&branding={Uri.EscapeDataString(branding)}";
        }
        else
        {
            qs = $"?disposition={Uri.EscapeDataString(disposition)}";
        }

        if (!string.IsNullOrEmpty(reportId))
        {
            return $"/{ReportExportRoutes.V1ReportsPrefix}/{Uri.EscapeDataString(reportId)}/{format}{qs}";
        }
        if (!string.IsNullOrEmpty(domain))
        {
            return $"/{ReportExportRoutes.V1ReportsPrefix}/by-domain/{Uri.EscapeDataString(domain)}/{format}{qs}";
        }
        return null;
    }

    private static string? BuildWorkbookExportPath(IQueryCollection query)
    {
        var reportId = query[ReportExportRoutes.ReportIdParam].ToString();
        var domain = query[ReportExportRoutes.DomainParam].ToString();
        var disposition = Defaulted(query[ReportExportRoutes.DispositionParam].ToString(), ContentDisposition.Attachment);
        var qs = $"?disposition={Uri.EscapeDataString(disposition)}";

        if (!string.IsNullOrEmpty(reportId))
        {
            return $"/{ReportExportRoutes.V1ReportsPrefix}/{Uri.EscapeDataString(reportId)}/{ReportExportFormats.Workbook}{qs}";
        }
        if (!string.IsNullOrEmpty(domain))
        {
            return $"/{ReportExportRoutes.V1ReportsPrefix}/by-domain/{Uri.EscapeDataString(domain)}/{ReportExportFormats.Workbook}{qs}";
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
