using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Npgsql;

namespace WebsiteProfiling.Data.EntityFrameworkCore;

/// <summary>
/// EF Core registration over the shared <see cref="NpgsqlDataSource"/> registered by
/// <c>AddWebsiteProfilingDatabase</c>. Every variant applies the command timeout from
/// <see cref="DatabaseOptions"/> and optionally no-tracking queries.
/// </summary>
public static class DbContextRegistrationExtensions
{
    public static IServiceCollection AddWebsiteProfilingDbContextPool<TContext>(
        this IServiceCollection services,
        bool noTracking = false,
        Action<DbContextOptionsBuilder>? configure = null)
        where TContext : DbContext
    {
        services.AddDbContextPool<TContext>((sp, options) =>
            ConfigureContext(sp, options, noTracking, configure));
        return services;
    }

    public static IServiceCollection AddWebsiteProfilingPooledDbContextFactory<TContext>(
        this IServiceCollection services,
        bool noTracking = false,
        Action<DbContextOptionsBuilder>? configure = null)
        where TContext : DbContext
    {
        services.AddPooledDbContextFactory<TContext>((sp, options) =>
            ConfigureContext(sp, options, noTracking, configure));
        return services;
    }

    public static IServiceCollection AddWebsiteProfilingDbContextFactory<TContext>(
        this IServiceCollection services,
        bool noTracking = false,
        Action<DbContextOptionsBuilder>? configure = null)
        where TContext : DbContext
    {
        services.AddDbContextFactory<TContext>((sp, options) =>
            ConfigureContext(sp, options, noTracking, configure));
        return services;
    }

    private static void ConfigureContext(
        IServiceProvider sp,
        DbContextOptionsBuilder options,
        bool noTracking,
        Action<DbContextOptionsBuilder>? configure)
    {
        var o = sp.GetRequiredService<IOptions<DatabaseOptions>>().Value;
        var dataSource = sp.GetRequiredService<NpgsqlDataSource>();
        options.UseNpgsql(dataSource, npg => npg.CommandTimeout(o.CommandTimeoutSeconds));
        if (noTracking)
        {
            options.UseQueryTrackingBehavior(QueryTrackingBehavior.NoTracking);
        }

        configure?.Invoke(options);
    }
}
