using Data.Application.Options;
using Data.Application.Persistence;
using Data.Application.Portfolio;
using Data.Application.Report;
using Data.Application.Repositories;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Npgsql;

namespace Data.Application;

public static class DependencyInjection
{
    /// <summary>
    /// Registers the read-only data layer: a shared <see cref="NpgsqlDataSource"/> (pooled to mirror
    /// the Python psycopg pool), a pooled <c>DataDbContext</c> with no-tracking queries, and the
    /// repositories. The connection string comes from <c>DATABASE_URL</c> (libpq URI form).
    /// </summary>
    public static IServiceCollection AddDataApplication(this IServiceCollection services)
    {
        services.AddMemoryCache();
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

        services.AddDbContextPool<DataDbContext>((sp, options) =>
        {
            var o = sp.GetRequiredService<IOptions<DatabaseOptions>>().Value;
            var dataSource = sp.GetRequiredService<NpgsqlDataSource>();
            options
                .UseNpgsql(dataSource, npg => npg.CommandTimeout(o.CommandTimeoutSeconds))
                .UseQueryTrackingBehavior(QueryTrackingBehavior.NoTracking);
        });

        services.AddScoped<IReportRepository, ReportRepository>();
        services.AddScoped<IGoogleDataRepository, GoogleDataRepository>();
        services.AddScoped<IPropertyRepository, PropertyRepository>();
        services.AddScoped<IReportSectionService, ReportSectionService>();
        services.AddScoped<IPortfolioRepository, PortfolioRepository>();
        services.AddScoped<IPortfolioService, PortfolioService>();
        services.AddScoped<IIssueStatusRepository, IssueStatusRepository>();
        services.AddScoped<ISavedFilterRepository, SavedFilterRepository>();

        return services;
    }
}
