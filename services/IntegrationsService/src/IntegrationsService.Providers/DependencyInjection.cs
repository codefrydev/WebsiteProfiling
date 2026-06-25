using IntegrationsService.Application.Google;
using IntegrationsService.Providers.Google;
using Microsoft.Extensions.DependencyInjection;

namespace IntegrationsService.Providers;

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
