using AiService.Application;
using AiService.Mcp;
using Microsoft.Extensions.DependencyInjection;

namespace AiService.Api;

/// <summary>
/// Shared service registration for <see cref="Program"/> and DI validation tests.
/// </summary>
public static class AiServiceHostRegistration
{
    /// <summary>Application, tools, MCP catalog, and optional MCP server — no MVC.</summary>
    public static IServiceCollection AddAiServiceCore(
        this IServiceCollection services,
        bool enableMcpHttp = false)
    {
        services.AddAiServiceApplication();
        services.AddAiServiceMcpCatalog();

        if (enableMcpHttp)
        {
            services.AddAiServiceMcp()
                .WithHttpTransport(options => options.Stateless = true);
        }

        return services;
    }

    public static IServiceCollection AddAiServiceHost(
        this IServiceCollection services,
        bool enableMcpHttp = false)
    {
        services.AddControllers();
        return services.AddAiServiceCore(enableMcpHttp);
    }

    public static ServiceProvider BuildValidatedProvider(this IServiceCollection services)
        => services.BuildServiceProvider(new ServiceProviderOptions
        {
            ValidateOnBuild = true,
            ValidateScopes = true,
        });
}
