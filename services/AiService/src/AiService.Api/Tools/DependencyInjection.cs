using AiService.Api.Tools.Bridge;
using AiService.Api.Tools.Options;
using AiService.Api.Tools.Persistence;
using AiService.Api.Tools.Registry;
using AiService.Api.Tools.Selection;
using AiService.Api.Tools.Services.Citations;
using Microsoft.Extensions.Options;
using WebsiteProfiling.Data;

namespace AiService.Api.Tools;

public static class DependencyInjection
{
    public const string PythonBridgeHttpClient = "python-audit-tool-bridge";

    /// <summary>
    /// Registers audit tool catalog, EF Core read context, C# handlers, and the Python HTTP bridge.
    /// </summary>
    public static IServiceCollection AddAiServiceTools(this IServiceCollection services)
    {
        services.AddWebsiteProfilingDatabase();

        services.AddOptions<FastApiOptions>()
            .BindConfiguration(FastApiOptions.SectionName)
            .PostConfigure(o =>
            {
                var fastApi = Environment.GetEnvironmentVariable("FASTAPI_URL");
                if (!string.IsNullOrWhiteSpace(fastApi))
                {
                    o.BaseUrl = fastApi.Trim();
                }
            });

        services.AddOptions<DataServiceOptions>()
            .BindConfiguration(DataServiceOptions.SectionName)
            .PostConfigure(o =>
            {
                var core = Environment.GetEnvironmentVariable("CORE_SERVICE_URL");
                if (!string.IsNullOrWhiteSpace(core))
                {
                    o.BaseUrl = core.Trim();
                }
                var dataService = Environment.GetEnvironmentVariable("DATA_SERVICE_URL");
                if (!string.IsNullOrWhiteSpace(dataService))
                {
                    o.BaseUrl = dataService.Trim();
                }
            });

        services.AddWebsiteProfilingDbContextFactory<AuditToolsDbContext>(noTracking: true);

        services.AddSingleton<ToolCatalog>();
        services.AddSingleton<ToolDispatcher>();
        services.AddMemoryCache();
        services.AddSingleton<AuditToolSelectionService>();

        services.AddScoped<CitationCheckService>();
        services.AddHttpClient(nameof(CitationCheckService), client =>
        {
            client.Timeout = TimeSpan.FromSeconds(20);
        });

        services.AddHttpClient("GeoAudit", client =>
        {
            client.Timeout = TimeSpan.FromSeconds(8);
            client.DefaultRequestHeaders.UserAgent.ParseAdd("SiteAudit/1.0");
        });

        services.AddHttpClient<PythonToolBridgeClient>((sp, client) =>
        {
            var opts = sp.GetRequiredService<IOptions<FastApiOptions>>().Value;
            client.BaseAddress = NormalizeBaseUri(opts.BaseUrl);
            client.Timeout = TimeSpan.FromSeconds(120);
        });

        services.AddHttpClient<DataServiceClient>((sp, client) =>
        {
            var opts = sp.GetRequiredService<IOptions<DataServiceOptions>>().Value;
            client.BaseAddress = NormalizeBaseUri(opts.BaseUrl);
            client.Timeout = TimeSpan.FromSeconds(60);
        });

        return services;
    }

    private static Uri NormalizeBaseUri(string baseUrl)
    {
        var trimmed = baseUrl.Trim().TrimEnd('/');
        return new Uri(trimmed.EndsWith('/') ? trimmed : trimmed + "/", UriKind.Absolute);
    }
}
