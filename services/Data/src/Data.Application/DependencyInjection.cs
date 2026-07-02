using Data.Application.Persistence;
using Data.Application.Portfolio;
using Data.Application.Python;
using Data.Application.Report;
using Data.Application.Repositories;
using Microsoft.Extensions.DependencyInjection;
using WebsiteProfiling.Data;
using WebsiteProfiling.Data.EntityFrameworkCore;

namespace Data.Application;

public static class DependencyInjection
{
    /// <summary>
    /// Registers the read-only data layer: a shared <c>NpgsqlDataSource</c> (pooled to mirror
    /// the Python psycopg pool), a pooled <c>DataDbContext</c> with no-tracking queries, and the
    /// repositories. The connection string comes from <c>DATABASE_URL</c> (libpq URI form).
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
        services.AddSingleton<DataPythonRunner>();

        return services;
    }
}
