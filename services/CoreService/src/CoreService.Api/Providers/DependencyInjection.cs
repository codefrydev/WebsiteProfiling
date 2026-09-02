using CoreService.Api.IntegrationsApplication.Google;
using CoreService.Api.Providers.Google;

namespace CoreService.Api.Providers;

public static class DependencyInjection
{
    public static IServiceCollection AddGoogleProviders(this IServiceCollection services)
    {
        services.AddScoped<IGoogleCredentialFactory, GoogleCredentialFactory>();
        services.AddScoped<IGscSearchAnalyticsClient, GscSearchAnalyticsClient>();
        services.AddScoped<IGa4ReportClient, Ga4ReportClient>();
        return services;
    }
}
