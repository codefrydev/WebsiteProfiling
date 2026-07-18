using System.Text.Json.Nodes;
using AiService.Tools.Context;
using AiService.Tools.Persistence;
using Microsoft.EntityFrameworkCore;

namespace AiService.Tests;

public sealed class AuditToolContextScopingTests
{
    private static AuditToolsDbContext NewDb(string? dbName = null) => new(
        new DbContextOptionsBuilder<AuditToolsDbContext>().UseInMemoryDatabase(dbName ?? Guid.NewGuid().ToString()).Options);

    [Fact]
    public async Task LoadPayloadAsync_scopes_to_property_domain_not_global_latest()
    {
        var dbName = Guid.NewGuid().ToString();
        await using (var seed = NewDb(dbName))
        {
            seed.Properties.Add(new PropertyRow { Id = 10, CanonicalDomain = "alpha.test" });
            seed.Properties.Add(new PropertyRow { Id = 20, CanonicalDomain = "beta.test" });
            seed.ReportPayloads.Add(new ReportPayloadRow
            {
                Id = 100,
                CanonicalDomain = "beta.test",
                Data = """{"site": "beta-newest"}""",
            });
            seed.ReportPayloads.Add(new ReportPayloadRow
            {
                Id = 50,
                CanonicalDomain = "alpha.test",
                Data = """{"site": "alpha-report"}""",
            });
            await seed.SaveChangesAsync();
        }

        await using var db = NewDb(dbName);
        var ctx = new AuditToolContext { PropertyId = 10 };
        var payload = await ctx.LoadPayloadAsync(db);

        Assert.Equal("alpha-report", payload["site"]!.GetValue<string>());
    }

    [Fact]
    public async Task LoadCrawlDfAsync_uses_property_scoped_crawl_run()
    {
        var dbName = Guid.NewGuid().ToString();
        await using (var seed = NewDb(dbName))
        {
            seed.Properties.Add(new PropertyRow { Id = 1, CanonicalDomain = "a.test" });
            seed.Properties.Add(new PropertyRow { Id = 2, CanonicalDomain = "b.test" });
            seed.CrawlRuns.Add(new CrawlRunRow { Id = 900, PropertyId = 2 });
            seed.CrawlRuns.Add(new CrawlRunRow { Id = 100, PropertyId = 1 });
            seed.CrawlResults.Add(new CrawlResultRow
            {
                Id = 1,
                CrawlRunId = 100,
                Url = "https://a.test/page",
                Data = """{"status": 200}""",
            });
            seed.CrawlResults.Add(new CrawlResultRow
            {
                Id = 2,
                CrawlRunId = 900,
                Url = "https://b.test/page",
                Data = """{"status": 200}""",
            });
            await seed.SaveChangesAsync();
        }

        await using var db = NewDb(dbName);
        var ctx = new AuditToolContext { PropertyId = 1 };
        var rows = await ctx.LoadCrawlDfAsync(db);

        Assert.Single(rows);
        Assert.Equal("https://a.test/page", rows[0]["url"]!.GetValue<string>());
    }

    [Fact]
    public async Task ResolvePropertyDomainAsync_supports_property_id_above_int_max()
    {
        const long largePropertyId = (long)int.MaxValue + 42;
        var dbName = Guid.NewGuid().ToString();
        await using (var seed = NewDb(dbName))
        {
            seed.Properties.Add(new PropertyRow
            {
                Id = largePropertyId,
                CanonicalDomain = "large-id.test",
            });
            await seed.SaveChangesAsync();
        }

        await using var db = NewDb(dbName);
        var ctx = new AuditToolContext { PropertyId = largePropertyId };
        var domain = await ctx.ResolvePropertyDomainAsync(db);

        Assert.Equal("large-id.test", domain);
    }

    [Fact]
    public async Task LoadPayloadAsync_matches_www_domain_variant()
    {
        var dbName = Guid.NewGuid().ToString();
        await using (var seed = NewDb(dbName))
        {
            seed.Properties.Add(new PropertyRow { Id = 10, CanonicalDomain = "alpha.test" });
            seed.ReportPayloads.Add(new ReportPayloadRow
            {
                Id = 50,
                CanonicalDomain = "www.alpha.test",
                Data = """{"site": "www-alpha-report"}""",
            });
            seed.ReportPayloads.Add(new ReportPayloadRow
            {
                Id = 100,
                CanonicalDomain = "beta.test",
                Data = """{"site": "beta-newest"}""",
            });
            await seed.SaveChangesAsync();
        }

        await using var db = NewDb(dbName);
        var ctx = new AuditToolContext { PropertyId = 10 };
        var payload = await ctx.LoadPayloadAsync(db);

        Assert.Equal("www-alpha-report", payload["site"]!.GetValue<string>());
    }

    [Fact]
    public async Task LoadPayloadAsync_falls_back_to_audit_health_snapshot_when_domain_missing()
    {
        var dbName = Guid.NewGuid().ToString();
        await using (var seed = NewDb(dbName))
        {
            seed.Properties.Add(new PropertyRow { Id = 10, CanonicalDomain = null });
            seed.ReportPayloads.Add(new ReportPayloadRow
            {
                Id = 50,
                CanonicalDomain = "orphan.test",
                Data = """{"site": "snapshot-report"}""",
            });
            seed.AuditHealthSnapshots.Add(new AuditHealthSnapshotRow
            {
                Id = 1,
                PropertyId = 10,
                ReportId = 50,
                GeneratedAt = DateTimeOffset.UtcNow,
            });
            await seed.SaveChangesAsync();
        }

        await using var db = NewDb(dbName);
        var ctx = new AuditToolContext { PropertyId = 10 };
        var payload = await ctx.LoadPayloadAsync(db);

        Assert.Equal("snapshot-report", payload["site"]!.GetValue<string>());
    }

    [Fact]
    public async Task LoadComparePairAsync_uses_snapshot_fallback_for_current_report()
    {
        var dbName = Guid.NewGuid().ToString();
        await using (var seed = NewDb(dbName))
        {
            seed.Properties.Add(new PropertyRow { Id = 10, CanonicalDomain = null });
            seed.ReportPayloads.Add(new ReportPayloadRow
            {
                Id = 50,
                Data = """{"site": "current"}""",
            });
            seed.ReportPayloads.Add(new ReportPayloadRow
            {
                Id = 40,
                Data = """{"site": "baseline"}""",
            });
            seed.AuditHealthSnapshots.Add(new AuditHealthSnapshotRow
            {
                Id = 1,
                PropertyId = 10,
                ReportId = 50,
                GeneratedAt = DateTimeOffset.UtcNow,
            });
            await seed.SaveChangesAsync();
        }

        await using var db = NewDb(dbName);
        var ctx = new AuditToolContext { PropertyId = 10 };
        var args = new System.Text.Json.Nodes.JsonObject { ["baseline_report_id"] = 40 };
        var (current, baseline, currentId, baselineId, error) = await ctx.LoadComparePairAsync(db, args);

        Assert.Null(error);
        Assert.Equal(50, currentId);
        Assert.Equal(40, baselineId);
        Assert.Equal("current", current!["site"]!.GetValue<string>());
        Assert.Equal("baseline", baseline!["site"]!.GetValue<string>());
    }
}
