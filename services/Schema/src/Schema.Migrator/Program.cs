using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Npgsql;
using Schema.Model.Persistence;
using WebsiteProfiling.Data;

var connectionString = NpgsqlDsn.ToNpgsql(
    Environment.GetEnvironmentVariable("DATABASE_URL")
    ?? throw new InvalidOperationException("DATABASE_URL is required."));

var services = new ServiceCollection();
services.AddLogging(b => b.AddSimpleConsole(o => o.TimestampFormat = "HH:mm:ss "));
services.AddDbContext<SchemaDbContext>(o => o.UseNpgsql(connectionString));

await using var provider = services.BuildServiceProvider();
var logger = provider.GetRequiredService<ILoggerFactory>().CreateLogger("Schema.Migrator");
await using var scope = provider.CreateAsyncScope();
var db = scope.ServiceProvider.GetRequiredService<SchemaDbContext>();

// Postgres may still be starting when this runs (e.g. right after `service_healthy` in compose);
// retry rather than fail the whole startup ordering on a transient connection error. Only retry
// genuinely transient Npgsql errors (connection-refused/DNS-fail/database-starting-up) — a bad
// DATABASE_URL, a permission error, or a syntax error in the migration SQL should fail fast
// instead of silently retrying for ~58s and masking the real problem.
const int maxAttempts = 30;
for (var attempt = 1; ; attempt++)
{
    try
    {
        logger.LogInformation("Applying EF Core migrations (attempt {Attempt}/{Max})", attempt, maxAttempts);
        await db.Database.MigrateAsync();
        logger.LogInformation("Migrations applied successfully.");
        return 0;
    }
    catch (NpgsqlException ex) when (attempt < maxAttempts && IsTransient(ex))
    {
        logger.LogWarning(ex, "Migration attempt {Attempt} failed with a transient error; retrying in 2s", attempt);
        await Task.Delay(TimeSpan.FromSeconds(2));
    }
}

static bool IsTransient(NpgsqlException ex) =>
    ex.SqlState is
        PostgresErrorCodes.ConnectionException or
        PostgresErrorCodes.ConnectionDoesNotExist or
        PostgresErrorCodes.ConnectionFailure or
        PostgresErrorCodes.CannotConnectNow or
        // A bare NpgsqlException with no SqlState (e.g. the socket connection itself failed
        // before Postgres could return an error code, such as "connection refused" while the
        // container is still starting) is also transient.
        null;
