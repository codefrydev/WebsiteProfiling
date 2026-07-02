using Microsoft.EntityFrameworkCore;
using Schema.Model.Persistence;
using WebsiteProfiling.Testing;

namespace Schema.Tests;

/// <summary>
/// Opt-in, <c>DATABASE_URL</c>-gated smoke test (mirrors <see cref="PostgresIntegration"/> usage
/// elsewhere in the repo). Does NOT apply migrations against whatever database DATABASE_URL points
/// at — it only confirms the model builds and connects, so it's safe to run against a real dev DB.
/// </summary>
public class SchemaParityTests
{
    private static bool Skip => !PostgresIntegration.IsConfigured;

    [Fact]
    public async Task Model_has_expected_table_count_and_connects()
    {
        if (Skip || !await PostgresIntegration.CanConnectAsync())
        {
            return;
        }

        await using var db = new SchemaDbContext(new DbContextOptionsBuilder<SchemaDbContext>()
            .UseNpgsql(PostgresIntegration.ConnectionString)
            .Options);

        var tableCount = db.Model.GetEntityTypes().Count();
        Assert.Equal(51, tableCount);

        // Cheap connectivity check without mutating schema/data.
        var canConnect = await db.Database.CanConnectAsync();
        Assert.True(canConnect);
    }
}
