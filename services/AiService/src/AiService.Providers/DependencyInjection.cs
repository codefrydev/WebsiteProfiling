using AiService.Providers.Chat;
using Microsoft.Extensions.DependencyInjection;

namespace AiService.Providers;

public static class DependencyInjection
{
    public static IServiceCollection AddAiServiceProviders(this IServiceCollection services)
    {
        services.AddScoped<IChatClientFactory, ChatClientFactory>();
        services.AddScoped<StructuredCompletionService>();
        return services;
    }
}
