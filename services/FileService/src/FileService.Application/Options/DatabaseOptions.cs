namespace FileService.Application.Options;

/// <summary>
/// Postgres connection settings for FileService's read-only report access. <see cref="ConnectionString"/>
/// is the libpq URI from env <c>DATABASE_URL</c> (the same value the Python / Data services use); it is
/// converted to an Npgsql keyword connection string by <c>NpgsqlDsn.ToNpgsql</c>.
/// </summary>
public sealed class DatabaseOptions
{
    public const string SectionName = "Database";

    /// <summary>libpq URI or Npgsql keyword string (env override: <c>DATABASE_URL</c>).</summary>
    public string ConnectionString { get; set; } = "";

    /// <summary>Minimum pooled connections.</summary>
    public int MinPoolSize { get; set; } = 1;

    /// <summary>Maximum pooled connections.</summary>
    public int MaxPoolSize { get; set; } = 10;

    /// <summary>Per-query command timeout (seconds).</summary>
    public int CommandTimeoutSeconds { get; set; } = 30;
}
