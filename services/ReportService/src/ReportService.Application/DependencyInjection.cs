using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using ReportService.Application.Bridge;
using ReportService.Application.Build;
using ReportService.Application.Compare;
using ReportService.Application.Dashboard;
using ReportService.Application.Integrations;
using ReportService.Application.Orchestration;
using ReportService.Application.Options;
using ReportService.Application.Persistence;
using ReportService.Application.Pipeline;
using ReportService.Application.Repositories;
using WebsiteProfiling.Data;
using WebsiteProfiling.Data.EntityFrameworkCore;

namespace ReportService.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddReportApplication(this IServiceCollection services)
    {
        services.AddWebsiteProfilingDatabase();

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

        services.AddOptions<WorkerOptions>()
            .BindConfiguration(WorkerOptions.SectionName)
            .PostConfigure(o =>
            {
                var root = Environment.GetEnvironmentVariable("WEBSITE_PROFILING_ROOT");
                if (!string.IsNullOrWhiteSpace(root))
                {
                    o.RepoRoot = root.Trim();
                }

                var dataDir = Environment.GetEnvironmentVariable("DATA_DIR");
                if (!string.IsNullOrWhiteSpace(dataDir))
                {
                    o.DataDir = dataDir.Trim();
                }

                var python = Environment.GetEnvironmentVariable("PYTHON");
                if (!string.IsNullOrWhiteSpace(python))
                {
                    o.PythonExecutable = python.Trim();
                }

                var enabled = Environment.GetEnvironmentVariable("REPORT_SERVICE_WORKER_ENABLED");
                if (string.Equals(enabled, "0", StringComparison.Ordinal)
                    || string.Equals(enabled, "false", StringComparison.OrdinalIgnoreCase))
                {
                    o.Enabled = false;
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

                var aiService = Environment.GetEnvironmentVariable("AI_SERVICE_URL");
                if (!string.IsNullOrWhiteSpace(aiService))
                {
                    o.AiServiceUrl = aiService.Trim();
                }
            });

        services.AddHttpClient();
        services.AddHttpClient(nameof(FastApiPythonBridge));
        services.AddHttpClient(nameof(ReportBuildService));
        services.AddHttpClient(nameof(IntegrationsReportDataClient));
        services.AddHttpClient(nameof(AiServiceEnrichmentClient));
        services.AddHttpClient(nameof(OptionalAuditsBuilder));
        services.AddHttpClient(nameof(SitemapDiscoveryService));
        services.AddHttpClient(nameof(SiteLevelBuilder));
        services.AddHttpClient(nameof(SubdomainInventoryBuilder));

        services.AddWebsiteProfilingPooledDbContextFactory<ReportDbContext>(noTracking: true);
        services.AddScoped(sp =>
            sp.GetRequiredService<IDbContextFactory<ReportDbContext>>().CreateDbContext());

        services.AddSingleton<FastApiPythonBridge>();
        services.AddScoped<CrawlRepository>();
        services.AddScoped<CrawlEdgesReader>();
        services.AddScoped<LighthouseDbReader>();
        services.AddScoped<LinkEdgesReader>();
        services.AddScoped<IntegrationsReportDataClient>();
        services.AddScoped<AiServiceEnrichmentClient>();
        services.AddScoped<CrawlPageHtmlReader>();
        services.AddScoped<SitemapDiscoveryService>();
        services.AddScoped<SiteLevelBuilder>();
        services.AddScoped<SubdomainInventoryBuilder>();
        services.AddScoped<ReportPayloadWriter>();
        services.AddScoped<CategoryBuilder>();
        services.AddScoped<NativeReportBuilder>();
        services.AddScoped<ReportBuildService>();
        services.AddScoped<PipelineOrchestratorService>();
        services.AddScoped<PipelineJobRepository>();
        services.AddScoped<PipelineConfigRepository>();
        services.AddScoped<PipelinePropertyRepository>();
        services.AddScoped<PipelineRunService>();
        services.AddScoped<PipelineJobRunner>();
        services.AddHostedService<PipelineWorkerBackgroundService>();
        services.AddScoped<DashboardRepository>();
        services.AddScoped<CompareExportService>();

        return services;
    }
}
