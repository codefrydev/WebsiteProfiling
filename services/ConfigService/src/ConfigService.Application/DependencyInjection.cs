using System.Text.Json;
using ConfigService.Application.Options;
using ConfigService.Application.Persistence;
using ConfigService.Application.Repositories;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Npgsql;

namespace ConfigService.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddConfigApplication(this IServiceCollection services)
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

        services.AddSingleton<NpgsqlDataSource>(sp =>
        {
            var o = sp.GetRequiredService<IOptions<DatabaseOptions>>().Value;
            var builder = new NpgsqlDataSourceBuilder(NpgsqlDsn.ToNpgsql(o.ConnectionString));
            builder.ConnectionStringBuilder.MinPoolSize = o.MinPoolSize;
            builder.ConnectionStringBuilder.MaxPoolSize = o.MaxPoolSize;
            return builder.Build();
        });

        services.AddScoped<IPipelineSettingsRepository, PipelineSettingsRepository>();
        services.AddScoped<IUiPreferencesRepository, UiPreferencesRepository>();
        services.AddScoped<IClientPreferencesRepository, ClientPreferencesRepository>();

        return services;
    }
}
