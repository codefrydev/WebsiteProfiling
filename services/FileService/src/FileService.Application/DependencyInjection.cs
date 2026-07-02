using FileService.Application.Clients;
using FileService.Application.Options;
using FileService.Application.Persistence;
using FileService.Application.Services;
using FileService.Rendering;
using FileService.Rendering.Exports;
using Microsoft.Extensions.DependencyInjection;
using WebsiteProfiling.Data;
using WebsiteProfiling.Data.EntityFrameworkCore;

namespace FileService.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddFileServiceApplication(this IServiceCollection services)
    {
        // App-settings / branding still come over HTTP (AppSettingsClient); only report payloads
        // move to direct Postgres access below.
        services.AddOptions<ReportApiOptions>()
            .BindConfiguration(ReportApiOptions.SectionName)
            .PostConfigure(o =>
            {
                var env = Environment.GetEnvironmentVariable("REPORT_API_URL");
                if (!string.IsNullOrWhiteSpace(env))
                {
                    o.BaseUrl = env.Trim();
                }
            });

        // Read-only Postgres access for report payloads — replaces the old HTTP hop to the Python
        // report API. Connection string comes from DATABASE_URL (libpq URI), same as the Data service.
        // The data source + context are built lazily, so callers that inject a fake IReportDataClient
        // (e.g. integration tests) never touch the DB.
        // Smaller pool than the default 2/20: FileService only reads report payloads.
        services.AddWebsiteProfilingDatabase(o =>
        {
            o.MinPoolSize = 1;
            o.MaxPoolSize = 10;
        });
        services.AddWebsiteProfilingDbContextPool<ReportDbContext>(noTracking: true);

        services.AddScoped<IReportDataClient, DbReportDataClient>();
        services.AddHttpClient<IAppSettingsClient, AppSettingsClient>();
        services.AddHttpClient<ILogoFetcher, LogoFetcher>();
        services.AddSingleton<AuditPdfGenerator>();
        services.AddSingleton<AuditWorkbookGenerator>();
        services.AddSingleton<ReportCsvExporter>();
        services.AddSingleton<ReportSitemapExporter>();
        services.AddSingleton<ReportJsonExporter>();
        services.AddScoped<IPdfReportService, PdfReportService>();
        services.AddScoped<IWorkbookReportService, WorkbookReportService>();
        services.AddScoped<IReportExportService, ReportExportService>();
        return services;
    }
}
