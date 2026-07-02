using IntegrationsService.Application.Google;
using IntegrationsService.Application.Persistence;
using IntegrationsService.Application.Report;
using IntegrationsService.Application.Repositories;
using Microsoft.Extensions.DependencyInjection;
using WebsiteProfiling.Data;
using WebsiteProfiling.Data.EntityFrameworkCore;

namespace IntegrationsService.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddIntegrationsApplication(this IServiceCollection services)
    {
        services.AddHttpClient();

        services.AddWebsiteProfilingDatabase();
        services.AddWebsiteProfilingDbContextPool<IntegrationsDbContext>();

        services.AddScoped<GoogleDataWriteRepository>();
        services.AddScoped<GoogleDataReadRepository>();
        services.AddScoped<PageGoogleSnapshotRepository>();
        services.AddScoped<GscLinksDataRepository>();
        services.AddScoped<KeywordDataRepository>();
        services.AddScoped<PipelineConfigRepository>();
        services.AddScoped<ReportEnrichmentService>();
        services.AddScoped<PropertyRepository>();
        services.AddScoped<GoogleAppSettingsRepository>();
        services.AddScoped<GoogleFetchService>();
        services.AddScoped<GoogleOAuthService>();
        services.AddScoped<PageLiveService>();
        services.AddScoped<PageCompareService>();
        services.AddScoped<BingWebmasterService>();
        services.AddScoped<KeywordExpandPlannerService>();
        services.AddSingleton<PythonCliRunner>();
        services.AddSingleton<FastApiPythonBridge>();

        return services;
    }
}
