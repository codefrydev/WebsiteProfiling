namespace WebsiteProfiling.Testing;

/// <summary>Helpers for optional Postgres integration tests (DATABASE_URL).</summary>
public static class PostgresIntegration
{
    public static string? ConnectionString
    {
        get
        {
            var url = Environment.GetEnvironmentVariable("DATABASE_URL");
            return string.IsNullOrWhiteSpace(url) ? null : url.Trim();
        }
    }

    public static bool IsConfigured => ConnectionString is not null;

    public static async Task<bool> CanConnectAsync(CancellationToken cancellationToken = default)
    {
        if (ConnectionString is null)
        {
            return false;
        }

        try
        {
            await using var conn = new Npgsql.NpgsqlConnection(ConnectionString);
            await conn.OpenAsync(cancellationToken);
            return true;
        }
        catch
        {
            return false;
        }
    }
}
