namespace WebsiteProfiling.Data;

/// <summary>
/// Postgres connection settings shared by every .NET service. <see cref="ConnectionString"/> is
/// the libpq URI from env <c>DATABASE_URL</c> (the same value the Python services use); it is
/// converted to an Npgsql keyword connection string by <see cref="NpgsqlDsn.ToNpgsql"/>.
/// Register via <c>AddWebsiteProfilingDatabase</c>, which allows per-service default overrides
/// (e.g. a smaller pool for a read-mostly service) while keeping appsettings and env-var precedence.
/// </summary>
public sealed class DatabaseOptions
{
    public const string SectionName = "Database";

    /// <summary>libpq URI or Npgsql keyword string (env override: <c>DATABASE_URL</c>).</summary>
    public string ConnectionString { get; set; } = "";

    /// <summary>Minimum pooled connections — mirrors the Python psycopg pool (<c>DB_POOL_MIN</c>, default 2).</summary>
    public int MinPoolSize { get; set; } = 2;

    /// <summary>Maximum pooled connections — mirrors the Python psycopg pool (<c>DB_POOL_MAX</c>, default 20).</summary>
    public int MaxPoolSize { get; set; } = 20;

    /// <summary>Per-query command timeout (seconds).</summary>
    public int CommandTimeoutSeconds { get; set; } = 30;
}
