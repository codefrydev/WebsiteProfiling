using AiService.Api.Providers.Chat;

namespace AiService.Api.Providers;

public static class DependencyInjection
{
    public static IServiceCollection AddAiServiceProviders(this IServiceCollection services)
    {
        services.AddScoped<IChatClientFactory, ChatClientFactory>();
        services.AddScoped<StructuredCompletionService>();
        return services;
    }
}
