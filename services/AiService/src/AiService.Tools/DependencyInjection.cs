using AiService.Tools.Bridge;
using AiService.Tools.Options;
using AiService.Tools.Persistence;
using AiService.Tools.Registry;
using AiService.Tools.Selection;
using AiService.Tools.Services.Citations;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Npgsql;

namespace AiService.Tools;

public static class DependencyInjection
{
    public const string PythonBridgeHttpClient = "python-audit-tool-bridge";

    /// <summary>
    /// Registers audit tool catalog, EF Core read context, C# handlers, and the Python HTTP bridge.
    /// </summary>
    public static IServiceCollection AddAiServiceTools(this IServiceCollection services)
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
                var fastApi = Environment.GetEnvironmentVariable("FASTAPI_URL");
                if (!string.IsNullOrWhiteSpace(fastApi))
                {
                    o.BaseUrl = fastApi.Trim();
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

        services.AddDbContextFactory<AuditToolsDbContext>((sp, options) =>
        {
            var o = sp.GetRequiredService<IOptions<DatabaseOptions>>().Value;
            var dataSource = sp.GetRequiredService<NpgsqlDataSource>();
            options
                .UseNpgsql(dataSource, npg => npg.CommandTimeout(o.CommandTimeoutSeconds))
                .UseQueryTrackingBehavior(QueryTrackingBehavior.NoTracking);
        });

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

        return services;
    }

    private static Uri NormalizeBaseUri(string baseUrl)
    {
        var trimmed = baseUrl.Trim().TrimEnd('/');
        return new Uri(trimmed.EndsWith('/') ? trimmed : trimmed + "/", UriKind.Absolute);
    }
}
