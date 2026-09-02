using CoreService.Api.IntegrationsApplication.Google;
using CoreService.Api.IntegrationsApplication.Persistence;
using CoreService.Api.IntegrationsApplication.Report;
using CoreService.Api.IntegrationsApplication.Repositories;
using WebsiteProfiling.Data;

namespace CoreService.Api.IntegrationsApplication;

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
