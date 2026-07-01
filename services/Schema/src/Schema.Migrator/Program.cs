using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
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
// retry rather than fail the whole startup ordering on a transient connection error.
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
    catch (Exception ex) when (attempt < maxAttempts)
    {
        logger.LogWarning(ex, "Migration attempt {Attempt} failed; retrying in 2s", attempt);
        await Task.Delay(TimeSpan.FromSeconds(2));
    }
}
