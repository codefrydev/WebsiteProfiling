using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Npgsql;
using ReportService.Application.Bridge;
using ReportService.Application.Build;
using ReportService.Application.Integrations;
using ReportService.Application.Orchestration;
using ReportService.Application.Options;
using ReportService.Application.Persistence;
using ReportService.Application.Repositories;

namespace ReportService.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddReportApplication(this IServiceCollection services)
    {
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

        services.AddOptions<FastApiOptions>()
            .BindConfiguration(FastApiOptions.SectionName)
            .PostConfigure(o =>
            {
                var url = Environment.GetEnvironmentVariable("FASTAPI_URL");
                if (!string.IsNullOrWhiteSpace(url))
                {
                    o.BaseUrl = url.Trim();
                }
            });

        services.AddOptions<ReportServiceOptions>()
            .BindConfiguration(ReportServiceOptions.SectionName)
            .PostConfigure(o =>
            {
                var bridge = Environment.GetEnvironmentVariable("REPORT_SERVICE_USE_PYTHON_BRIDGE");
                if (string.Equals(bridge, "0", StringComparison.Ordinal)
                    || string.Equals(bridge, "false", StringComparison.OrdinalIgnoreCase))
                {
                    o.UsePythonBridge = false;
                }
                else if (string.Equals(bridge, "1", StringComparison.Ordinal)
                         || string.Equals(bridge, "true", StringComparison.OrdinalIgnoreCase))
                {
                    o.UsePythonBridge = true;
                }

                var integrations = Environment.GetEnvironmentVariable("INTEGRATIONS_SERVICE_URL");
                if (!string.IsNullOrWhiteSpace(integrations))
                {
                    o.IntegrationsServiceUrl = integrations.Trim();
                }
            });

        services.AddHttpClient();
        services.AddHttpClient(nameof(FastApiPythonBridge));
        services.AddHttpClient(nameof(ReportBuildService));
        services.AddHttpClient(nameof(IntegrationsReportDataClient));
        services.AddHttpClient(nameof(SitemapDiscoveryService));

        services.AddSingleton<NpgsqlDataSource>(sp =>
        {
            var o = sp.GetRequiredService<IOptions<DatabaseOptions>>().Value;
            var builder = new NpgsqlDataSourceBuilder(NpgsqlDsn.ToNpgsql(o.ConnectionString));
            builder.ConnectionStringBuilder.MinPoolSize = o.MinPoolSize;
            builder.ConnectionStringBuilder.MaxPoolSize = o.MaxPoolSize;
            return builder.Build();
        });

        services.AddDbContextPool<ReportDbContext>((sp, options) =>
        {
            var o = sp.GetRequiredService<IOptions<DatabaseOptions>>().Value;
            var dataSource = sp.GetRequiredService<NpgsqlDataSource>();
            options
                .UseNpgsql(dataSource, npg => npg.CommandTimeout(o.CommandTimeoutSeconds))
                .UseQueryTrackingBehavior(QueryTrackingBehavior.NoTracking);
        });

        services.AddSingleton<FastApiPythonBridge>();
        services.AddScoped<CrawlRepository>();
        services.AddScoped<LighthouseDbReader>();
        services.AddScoped<LinkEdgesReader>();
        services.AddScoped<IntegrationsReportDataClient>();
        services.AddScoped<SitemapDiscoveryService>();
        services.AddScoped<ReportPayloadWriter>();
        services.AddScoped<CategoryBuilder>();
        services.AddScoped<NativeReportBuilder>();
        services.AddScoped<ReportBuildService>();
        services.AddScoped<PipelineOrchestratorService>();

        return services;
    }
}
