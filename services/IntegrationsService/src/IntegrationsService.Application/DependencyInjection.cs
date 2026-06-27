using IntegrationsService.Application.Google;
using IntegrationsService.Application.Options;
using IntegrationsService.Application.Persistence;
using IntegrationsService.Application.Report;
using IntegrationsService.Application.Repositories;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Npgsql;

namespace IntegrationsService.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddIntegrationsApplication(this IServiceCollection services)
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

        services.AddHttpClient();

        services.AddSingleton<NpgsqlDataSource>(sp =>
        {
            var o = sp.GetRequiredService<IOptions<DatabaseOptions>>().Value;
            var builder = new NpgsqlDataSourceBuilder(NpgsqlDsn.ToNpgsql(o.ConnectionString));
            builder.ConnectionStringBuilder.MinPoolSize = o.MinPoolSize;
            builder.ConnectionStringBuilder.MaxPoolSize = o.MaxPoolSize;
            return builder.Build();
        });

        services.AddDbContextPool<IntegrationsDbContext>((sp, options) =>
        {
            var o = sp.GetRequiredService<IOptions<DatabaseOptions>>().Value;
            var dataSource = sp.GetRequiredService<NpgsqlDataSource>();
            options.UseNpgsql(dataSource, npg => npg.CommandTimeout(o.CommandTimeoutSeconds));
        });

        services.AddScoped<GoogleDataWriteRepository>();
        services.AddScoped<GoogleDataReadRepository>();
        services.AddScoped<PageGoogleSnapshotRepository>();
        services.AddScoped<GscLinksDataRepository>();
        services.AddScoped<KeywordDataRepository>();
        services.AddScoped<PipelineConfigRepository>();
        services.AddScoped<ReportEnrichmentService>();
        services.AddScoped<PropertyRepository>();
        services.AddScoped<GoogleAppSettingsRepository>();
        services.AddScoped<GoogleFetchService>();
        services.AddScoped<GoogleOAuthService>();
        services.AddScoped<PageLiveService>();
        services.AddScoped<PageCompareService>();
        services.AddScoped<BingWebmasterService>();
        services.AddScoped<KeywordExpandPlannerService>();
        services.AddSingleton<PythonCliRunner>();
        services.AddSingleton<FastApiPythonBridge>();

        return services;
    }
}
