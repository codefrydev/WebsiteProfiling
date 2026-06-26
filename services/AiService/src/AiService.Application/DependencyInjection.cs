using AiService.Application.Chat;
using AiService.Application.Options;
using AiService.Application.Persistence;
using AiService.Application.Repositories;
using AiService.Application.Services;
using AiService.Domain.Repositories;
using AiService.Providers;
using AiService.Tools;
using AiService.Tools.Registry;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Npgsql;

namespace AiService.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddAiServiceApplication(this IServiceCollection services)
    {
        services.AddAiServiceProviders();
        services.AddAiServiceTools();

        services.AddSingleton<ToolRegistry>(ToolRegistryExtensions.CreateToolRegistry);

        services.AddOptions<DatabaseOptions>()
            .BindConfiguration(DatabaseOptions.SectionName)
            .PostConfigure(o =>
            {
                var url = Environment.GetEnvironmentVariable("DATABASE_URL");
                if (!string.IsNullOrWhiteSpace(url))
                {
                    o.ConnectionString = url.Trim();
                }
            });

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

        services.AddSingleton<NpgsqlDataSource>(sp =>
        {
            var o = sp.GetRequiredService<IOptions<DatabaseOptions>>().Value;
            var builder = new NpgsqlDataSourceBuilder(NpgsqlDsn.ToNpgsql(o.ConnectionString));
            builder.ConnectionStringBuilder.MinPoolSize = o.MinPoolSize;
            builder.ConnectionStringBuilder.MaxPoolSize = o.MaxPoolSize;
            builder.ConnectionStringBuilder.CommandTimeout = o.CommandTimeoutSeconds;
            return builder.Build();
        });

        services.AddDbContextPool<AiDbContext>((sp, options) =>
        {
            var o = sp.GetRequiredService<IOptions<DatabaseOptions>>().Value;
            var dataSource = sp.GetRequiredService<NpgsqlDataSource>();
            options.UseNpgsql(dataSource, npg => npg.CommandTimeout(o.CommandTimeoutSeconds));
        });

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
