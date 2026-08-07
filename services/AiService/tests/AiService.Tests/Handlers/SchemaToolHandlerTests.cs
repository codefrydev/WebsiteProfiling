using System.Text.Json.Nodes;
using AiService.Tools.Context;
using AiService.Tools.Handlers.Schema;
using AiService.Tools.Persistence;
using Microsoft.EntityFrameworkCore;

namespace AiService.Tests.Handlers;

/// <summary>Ports Python <c>tools/audit_tools/crawl/crawl.py::get_seo_health</c> and
/// <c>tools/audit_tools/content/content_lists.py::list_schema_errors_by_type</c>.</summary>
public sealed class SchemaToolHandlerTests
{
    private static AuditToolsDbContext NewDb()
    {
        var options = new DbContextOptionsBuilder<AuditToolsDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new AuditToolsDbContext(options);
    }

    private static async Task<AuditToolsDbContext> SeedPayloadAsync(string json, int reportId = 1)
    {
        var db = NewDb();
        db.ReportPayloads.Add(new ReportPayloadRow { Id = reportId, Data = json });
        await db.SaveChangesAsync();
        return db;
    }

    [Fact]
    public async Task GetSeoHealthAsync_returns_seo_health_slice()
    {
        await using var db = await SeedPayloadAsync("""{"seo_health": {"score": 82, "issues": 3}}""");
        var ctx = new AuditToolContext { ReportId = 1 };

        var result = await SchemaToolHandlers.GetSeoHealthAsync(db, ctx, [], CancellationToken.None);

        Assert.False(result["missing"]!.GetValue<bool>());
        Assert.Equal(82, result["data"]!["score"]!.GetValue<int>());
    }

    [Fact]
    public async Task GetSeoHealthAsync_returns_error_when_no_report()
    {
        await using var db = NewDb();
        var ctx = new AuditToolContext { ReportId = 1 };

        var result = await SchemaToolHandlers.GetSeoHealthAsync(db, ctx, [], CancellationToken.None);

        Assert.Equal("no report found", result["error"]!.GetValue<string>());
    }

    [Fact]
    public async Task ListSchemaErrorsByTypeAsync_excludes_passing_entries()
    {
        await using var db = await SeedPayloadAsync("""
            {"rich_results_validation": [
                {"type": "Product", "status": "fail"},
                {"type": "FAQPage", "status": "pass"}
            ]}
            """);
        var ctx = new AuditToolContext { ReportId = 1 };

        var result = await SchemaToolHandlers.ListSchemaErrorsByTypeAsync(db, ctx, [], CancellationToken.None);

        var errors = result["errors"]!.AsArray();
        Assert.Single(errors);
        Assert.Equal("Product", errors[0]!["type"]!.GetValue<string>());
    }

    [Fact]
    public async Task ListSchemaErrorsByTypeAsync_filters_by_schema_type_substring()
    {
        await using var db = await SeedPayloadAsync("""
            {"rich_results_validation": [
                {"type": "Product", "status": "fail"},
                {"type": "FAQPage", "status": "fail"}
            ]}
            """);
        var ctx = new AuditToolContext { ReportId = 1 };
        var args = new JsonObject { ["schema_type"] = "faq" };

        var result = await SchemaToolHandlers.ListSchemaErrorsByTypeAsync(db, ctx, args, CancellationToken.None);

        var errors = result["errors"]!.AsArray();
        Assert.Single(errors);
        Assert.Equal("FAQPage", errors[0]!["type"]!.GetValue<string>());
    }

    [Fact]
    public async Task ListSchemaErrorsByTypeAsync_returns_error_when_no_report()
    {
        await using var db = NewDb();
        var ctx = new AuditToolContext { ReportId = 1 };

        var result = await SchemaToolHandlers.ListSchemaErrorsByTypeAsync(db, ctx, [], CancellationToken.None);

        Assert.Equal("no report found", result["error"]!.GetValue<string>());
        Assert.Equal(0, result["total"]!.GetValue<int>());
    }
}
