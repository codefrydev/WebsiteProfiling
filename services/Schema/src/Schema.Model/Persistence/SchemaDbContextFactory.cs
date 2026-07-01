using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using WebsiteProfiling.Data;

namespace Schema.Model.Persistence;

/// <summary>
/// Lets <c>dotnet ef</c> commands (migrations add/update, dbcontext scaffold) construct
/// <see cref="SchemaDbContext"/> without a hosting project. Reads the same <c>DATABASE_URL</c>
/// (libpq URI) every other service already uses, so authoring migrations needs no second
/// connection-string dialect.
/// </summary>
public sealed class SchemaDbContextFactory : IDesignTimeDbContextFactory<SchemaDbContext>
{
    public SchemaDbContext CreateDbContext(string[] args)
    {
        var raw = Environment.GetEnvironmentVariable("DATABASE_URL")
            ?? throw new InvalidOperationException(
                "DATABASE_URL must be set, e.g. " +
                "DATABASE_URL=postgres://profiling:profiling@localhost:5432/website_profiling dotnet ef ...");

        var options = new DbContextOptionsBuilder<SchemaDbContext>()
            .UseNpgsql(NpgsqlDsn.ToNpgsql(raw))
            .Options;
        return new SchemaDbContext(options);
    }
}
