using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;
using Npgsql;

namespace WebsiteProfiling.Data;

public static class DatabaseServiceCollectionExtensions
{
    /// <summary>
    /// Binds <see cref="DatabaseOptions"/> from the <c>Database</c> configuration section, applies
    /// the <c>DATABASE_URL</c> env override, and registers a singleton <see cref="NpgsqlDataSource"/>
    /// built from <see cref="NpgsqlDsn.ToNpgsql"/> with the pool settings from options.
    /// </summary>
    /// <param name="configureDefaults">
    /// Optional per-service defaults (e.g. a smaller pool). Runs before configuration binding, so
    /// precedence stays: code defaults &lt; appsettings <c>Database</c> section &lt; <c>DATABASE_URL</c>.
    /// </param>
    /// <remarks>
    /// Idempotent: the data source is registered with <c>TryAddSingleton</c>, so composition roots
    /// that layer on top of each other (e.g. AiService.Application over AiService.Tools) can both
    /// call this.
    /// </remarks>
    public static IServiceCollection AddWebsiteProfilingDatabase(
        this IServiceCollection services,
        Action<DatabaseOptions>? configureDefaults = null)
    {
        var options = services.AddOptions<DatabaseOptions>();
        if (configureDefaults is not null)
        {
            options.Configure(configureDefaults);
        }

        options
            .BindConfiguration(DatabaseOptions.SectionName)
            .PostConfigure(o =>
            {
                var url = Environment.GetEnvironmentVariable("DATABASE_URL");
                if (!string.IsNullOrWhiteSpace(url))
                {
                    o.ConnectionString = url.Trim();
                }
            });

        services.TryAddSingleton<NpgsqlDataSource>(sp =>
        {
            var o = sp.GetRequiredService<IOptions<DatabaseOptions>>().Value;
            var builder = new NpgsqlDataSourceBuilder(NpgsqlDsn.ToNpgsql(o.ConnectionString));
            builder.ConnectionStringBuilder.MinPoolSize = o.MinPoolSize;
            builder.ConnectionStringBuilder.MaxPoolSize = o.MaxPoolSize;
            builder.ConnectionStringBuilder.CommandTimeout = o.CommandTimeoutSeconds;
            return builder.Build();
        });

        return services;
    }
}
