namespace ConfigService.Application.Options;

/// <summary>
/// Postgres connection settings for the Config service. <see cref="ConnectionString"/> is the libpq
/// URI from env <c>DATABASE_URL</c>; converted by <see cref="Persistence.NpgsqlDsn.ToNpgsql"/>.
/// </summary>
public sealed class DatabaseOptions
{
    public const string SectionName = "Database";

    public string ConnectionString { get; set; } = "";

    public int MinPoolSize { get; set; } = 2;

    public int MaxPoolSize { get; set; } = 20;

    public int CommandTimeoutSeconds { get; set; } = 30;
}
