using CoreService.Api.DataApplication.Clients;
using CoreService.Api.DataApplication.Options;
using CoreService.Api.DataApplication.Persistence;
using CoreService.Api.DataApplication.Portfolio;
using CoreService.Api.DataApplication.Python;
using CoreService.Api.DataApplication.Report;
using CoreService.Api.DataApplication.Repositories;
using CoreService.Api.DataApplication.Services;
using CoreService.Api.Rendering;
using CoreService.Api.Rendering.Exports;
using WebsiteProfiling.Data;

namespace CoreService.Api.DataApplication;

public static class DependencyInjection
{
    /// <summary>
    /// Registers the data layer: a shared <c>NpgsqlDataSource</c> (pooled to mirror the Python
    /// psycopg pool), a pooled <c>DataDbContext</c> with no-tracking queries, and the repositories.
    /// Most access is no-tracking reads; a few repositories write via raw SQL (PropertiesCrudRepository,
    /// ContentDraftRepository) or EF Core SaveChanges/ExecuteDeleteAsync (SavedFilterRepository,
    /// IssueStatusRepository, PortfolioRepository). The connection string comes from <c>DATABASE_URL</c>
    /// (libpq URI form).
    /// </summary>
    public static IServiceCollection AddDataApplication(this IServiceCollection services)
    {
        services.AddMemoryCache();
        services.AddWebsiteProfilingDatabase();
        services.AddWebsiteProfilingDbContextPool<DataDbContext>(noTracking: true);

        services.AddScoped<IReportRepository, ReportRepository>();
        services.AddScoped<IGoogleDataRepository, GoogleDataRepository>();
        services.AddScoped<IPropertyRepository, PropertyRepository>();
        services.AddScoped<IReportSectionService, ReportSectionService>();
        services.AddScoped<IPortfolioRepository, PortfolioRepository>();
        services.AddScoped<IPortfolioService, PortfolioService>();
        services.AddScoped<IIssueStatusRepository, IssueStatusRepository>();
        services.AddScoped<ISavedFilterRepository, SavedFilterRepository>();
        services.AddScoped<IPropertiesCrudRepository, PropertiesCrudRepository>();
        services.AddScoped<IContentDraftRepository, ContentDraftRepository>();
        services.AddScoped<IPageMarkdownRepository, PageMarkdownRepository>();
        services.AddScoped<IPipelineJobEnqueueRepository, PipelineJobEnqueueRepository>();
        services.AddScoped<IBacklinksRepository, BacklinksRepository>();
        services.AddScoped<IPipelineSettingsRepository, PipelineSettingsRepository>();
        services.AddScoped<IUiPreferencesRepository, UiPreferencesRepository>();
        services.AddScoped<IClientPreferencesRepository, ClientPreferencesRepository>();
        services.AddSingleton<DataPythonRunner>();

        // Report export (PDF/Excel/CSV/JSON/sitemap) — absorbed from the former FileService.
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

        services.AddScoped<IReportDataClient, DbReportDataClient>();
        services.AddScoped<IAppSettingsClient, AppSettingsClient>();
        services.AddHttpClient<ILogoFetcher, LogoFetcher>()
            .ConfigureHttpClient(client =>
            {
                client.Timeout = TimeSpan.FromSeconds(10);
            });
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
