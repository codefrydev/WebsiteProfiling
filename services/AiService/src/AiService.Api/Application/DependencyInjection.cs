using AiService.Api.Application.Chat;
using AiService.Api.Application.Options;
using AiService.Api.Application.Persistence;
using AiService.Api.Application.Repositories;
using AiService.Api.Application.Services;
using AiService.Api.Domain.Repositories;
using AiService.Api.Providers;
using AiService.Api.Tools;
using AiService.Api.Tools.Registry;
using WebsiteProfiling.Data;

namespace AiService.Api.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddAiServiceApplication(this IServiceCollection services)
    {
        services.AddAiServiceProviders();
        services.AddAiServiceTools();

        services.AddSingleton<ToolRegistry>(ToolRegistryExtensions.CreateToolRegistry);

        services.AddWebsiteProfilingDatabase();

        services.AddOptions<UpstreamOptions>()
            .BindConfiguration(UpstreamOptions.SectionName)
            .PostConfigure(o =>
            {
                var fastApi = Environment.GetEnvironmentVariable("FASTAPI_URL");
                if (!string.IsNullOrWhiteSpace(fastApi))
                {
                    o.FastApiUrl = fastApi.Trim();
                }
            });

        services.AddWebsiteProfilingDbContextPool<AiDbContext>();

        services.AddHttpClient(OllamaCatalogService.LocalProbeClientName, client =>
        {
            client.Timeout = TimeSpan.FromSeconds(8);
        });

        services.AddHttpClient(OllamaCatalogService.CloudCatalogClientName, client =>
        {
            client.Timeout = TimeSpan.FromSeconds(12);
        });

        services.AddScoped<ILlmSettingsRepository, LlmSettingsRepository>();
        services.AddScoped<IIntegrationSecretsRepository, IntegrationSecretsRepository>();
        services.AddScoped<IMcpSettingsRepository, McpSettingsRepository>();
        services.AddScoped<IFeatureFlagsRepository, FeatureFlagsRepository>();
        services.AddScoped<IGoogleAppSettingsRepository, GoogleAppSettingsRepository>();
        services.AddScoped<SecretsService>();
        services.AddScoped<LlmCacheRepository>();
        services.AddScoped<ILlmCacheRepository>(sp => sp.GetRequiredService<LlmCacheRepository>());
        services.AddScoped<IChatSessionRepository, ChatSessionRepository>();

        services.AddScoped<FixSuggestionService>();
        services.AddScoped<IssuesActionPlanService>();
        services.AddScoped<PageCoachService>();
        services.AddScoped<DashboardAiService>();
        services.AddScoped<ContentWizardService>();
        services.AddScoped<ContentAnalyzeService>();
        services.AddScoped<OllamaCatalogService>();
        services.AddScoped<EnrichmentService>();
        services.AddScoped<AuditChatToolsBuilder>();
        services.AddScoped<ChatNarrativeSynthesizer>();
        services.AddScoped<ChatAgentLoop>();
        services.AddScoped<ChatAgentService>();

        return services;
    }
}
