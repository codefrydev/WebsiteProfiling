using FileService.Application.Clients;
using FileService.Application.Persistence;
using FileService.Application.Options;
using FileService.Application.Services;
using FileService.Rendering;
using FileService.Rendering.Exports;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Npgsql;

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
        services.AddOptions<DatabaseOptions>()
            .BindConfiguration(DatabaseOptions.SectionName)
            .PostConfigure(o =>
            {
                var url = Environment.GetEnvironmentVariable("DATABASE_URL");
                if (!string.IsNullOrWhiteSpace(url))
                {
                    o.ConnectionString = url.Trim();
                }
            });

        services.AddSingleton<NpgsqlDataSource>(sp =>
        {
            var o = sp.GetRequiredService<IOptions<DatabaseOptions>>().Value;
            var builder = new NpgsqlDataSourceBuilder(NpgsqlDsn.ToNpgsql(o.ConnectionString));
            builder.ConnectionStringBuilder.MinPoolSize = o.MinPoolSize;
            builder.ConnectionStringBuilder.MaxPoolSize = o.MaxPoolSize;
            return builder.Build();
        });

        services.AddDbContextPool<ReportDbContext>((sp, options) =>
        {
            var o = sp.GetRequiredService<IOptions<DatabaseOptions>>().Value;
            var dataSource = sp.GetRequiredService<NpgsqlDataSource>();
            options
                .UseNpgsql(dataSource, npg => npg.CommandTimeout(o.CommandTimeoutSeconds))
                .UseQueryTrackingBehavior(QueryTrackingBehavior.NoTracking);
        });

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
