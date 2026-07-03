using System.Text.Json.Nodes;
using AiService.Tools.Artifacts;
using AiService.Tools.Bridge;
using AiService.Tools.Context;
using AiService.Tools.Handlers.Export;
using AiService.Tools.Handlers.Security;
using AiService.Tools.Options;
using AiService.Tools.Persistence;
using AiService.Tools.Registry;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace AiService.Tests.Handlers;

/// <summary>Ports Python <c>tools/audit_tools/export/export_tools.py</c> and
/// <c>export/export_extras.py</c>.</summary>
[Collection("DATA_DIR env var")]
public sealed class ExportToolHandlerTests : IDisposable
{
    private readonly string _previousDataDir;
    private readonly string _tempDir;

    public ExportToolHandlerTests()
    {
        _previousDataDir = Environment.GetEnvironmentVariable("DATA_DIR") ?? "";
        _tempDir = Path.Combine(Path.GetTempPath(), "export-tool-tests-" + Guid.NewGuid());
        Directory.CreateDirectory(_tempDir);
        Environment.SetEnvironmentVariable("DATA_DIR", _tempDir);
    }

    public void Dispose()
    {
        Environment.SetEnvironmentVariable("DATA_DIR", _previousDataDir.Length == 0 ? null : _previousDataDir);
        try
        {
            Directory.Delete(_tempDir, recursive: true);
        }
        catch (IOException)
        {
        }
    }

    private static AuditToolsDbContext NewDb(string? dbName = null)
    {
        var options = new DbContextOptionsBuilder<AuditToolsDbContext>()
            .UseInMemoryDatabase(dbName ?? Guid.NewGuid().ToString())
            .Options;
        return new AuditToolsDbContext(options);
    }

    private sealed class InMemoryDbContextFactory(string dbName) : IDbContextFactory<AuditToolsDbContext>
    {
        public AuditToolsDbContext CreateDbContext() => NewDb(dbName);
    }

    private static ToolDispatcher BuildDispatcher(string dbName, params IToolHandler[] handlers)
    {
        var registry = new ToolRegistry();
        registry.RegisterRange(handlers);
        var bridge = new PythonToolBridgeClient(new HttpClient(), Options.Create(new FastApiOptions()));
        return new ToolDispatcher(new InMemoryDbContextFactory(dbName), registry, bridge, NullLogger<ToolDispatcher>.Instance);
    }

    [Fact]
    public async Task ListExportFormatsAsync_lists_all_export_tools()
    {
        await using var db = NewDb();
        var ctx = new AuditToolContext();

        var result = await ExportToolHandlers.ListExportFormatsAsync(db, ctx, [], CancellationToken.None);

        var formats = result["formats"]!.AsArray();
        var tools = formats.Select(f => f!["tool"]!.GetValue<string>()).Distinct().ToList();
        Assert.Contains("export_audit_report", tools);
        Assert.Contains("export_compare_csv", tools);
        Assert.Contains("export_list_as_csv", tools);
        Assert.NotEmpty(result["example_prompts"]!.AsArray());
        Assert.NotEmpty(result["notes"]!.AsArray());
    }

    [Fact]
    public async Task ExportSitemapXmlAsync_builds_sitemap_from_indexable_links()
    {
        await using var db = await SeedAsync("""
            {"links": [
                {"url": "https://a.com/", "status": "200"},
                {"url": "https://a.com/noindex", "status": "200", "noindex": true},
                {"url": "https://a.com/404", "status": "404"}
            ]}
            """);
        var ctx = new AuditToolContext { ReportId = 1 };

        var result = await ExportToolHandlers.ExportSitemapXmlAsync(db, ctx, [], CancellationToken.None);

        Assert.Equal(1, result["url_count"]!.GetValue<int>());
        var stored = ArtifactStore.ReadArtifactBytes(result["artifact_id"]!.GetValue<string>());
        var xml = System.Text.Encoding.UTF8.GetString(stored!.Value.Bytes);
        Assert.Contains("<loc>https://a.com/</loc>", xml);
        Assert.DoesNotContain("noindex<", xml);
    }

    [Fact]
    public async Task ExportSitemapXmlAsync_returns_error_when_no_report()
    {
        await using var db = NewDb();
        var ctx = new AuditToolContext { ReportId = 1 };

        var result = await ExportToolHandlers.ExportSitemapXmlAsync(db, ctx, [], CancellationToken.None);

        Assert.Equal("report not found", result["error"]!.GetValue<string>());
    }

    [Fact]
    public async Task ExportCompareCsvAsync_diffs_added_and_removed_issues()
    {
        var dbName = Guid.NewGuid().ToString();
        await using (var seedDb = NewDb(dbName))
        {
            seedDb.ReportPayloads.Add(new ReportPayloadRow
            {
                Id = 1,
                Data = """{"categories": [{"name": "seo", "issues": [{"url": "https://a", "message": "new issue", "priority": "high"}]}]}""",
            });
            seedDb.ReportPayloads.Add(new ReportPayloadRow
            {
                Id = 2,
                Data = """{"categories": [{"name": "seo", "issues": [{"url": "https://b", "message": "old issue", "priority": "low"}]}]}""",
            });
            await seedDb.SaveChangesAsync();
        }

        await using var db = NewDb(dbName);
        var ctx = new AuditToolContext { ReportId = 1 };
        var args = new JsonObject { ["baseline_report_id"] = 2 };

        var result = await ExportToolHandlers.ExportCompareCsvAsync(db, ctx, args, CancellationToken.None);

        Assert.Equal(1, result["current_report_id"]!.GetValue<int>());
        Assert.Equal(2, result["baseline_report_id"]!.GetValue<int>());
        var stored = ArtifactStore.ReadArtifactBytes(result["artifact_id"]!.GetValue<string>());
        var csv = System.Text.Encoding.UTF8.GetString(stored!.Value.Bytes);
        // Matches Python's export_compare.py naming exactly: only-in-current is "removed",
        // only-in-baseline is "added" (relative to the diff direction Python chose, not intuitive).
        Assert.Contains("removed,seo,high,https://a,new issue", csv);
        Assert.Contains("added,seo,low,https://b,old issue", csv);
    }

    [Fact]
    public async Task ExportCompareCsvAsync_requires_baseline_report_id()
    {
        await using var db = NewDb();
        var ctx = new AuditToolContext { ReportId = 1 };

        var result = await ExportToolHandlers.ExportCompareCsvAsync(db, ctx, [], CancellationToken.None);

        Assert.Equal("baseline_report_id is required", result["error"]!.GetValue<string>());
    }

    [Fact]
    public async Task ExportListAsCsvAsync_rejects_tool_not_on_allowlist()
    {
        var dispatcher = BuildDispatcher(Guid.NewGuid().ToString());
        var ctx = new AuditToolContext { ReportId = 1 };
        var args = new JsonObject { ["tool_name"] = "get_report_summary" };

        var result = await ExportToolHandlers.ExportListAsCsvAsync(ctx, args, dispatcher, CancellationToken.None);

        Assert.Equal("tool_name not allowed for CSV export: get_report_summary", result["error"]!.GetValue<string>());
    }

    [Fact]
    public async Task ExportListAsCsvAsync_dispatches_allowlisted_tool_and_saves_csv_artifact()
    {
        var dbName = Guid.NewGuid().ToString();
        await using (var seedDb = NewDb(dbName))
        {
            seedDb.ReportPayloads.Add(new ReportPayloadRow
            {
                Id = 1,
                Data = """{"security_findings": [{"finding_type": "mixed_content", "severity": "high"}]}""",
            });
            await seedDb.SaveChangesAsync();
        }

        var dispatcher = BuildDispatcher(
            dbName,
            new DelegatingToolHandler("list_security_findings_by_type", SecurityToolHandlers.ListSecurityFindingsByTypeAsync));
        var ctx = new AuditToolContext { ReportId = 1 };
        var args = new JsonObject
        {
            ["tool_name"] = "list_security_findings_by_type",
            ["tool_args"] = new JsonObject { ["finding_type"] = "mixed_content" },
        };

        var result = await ExportToolHandlers.ExportListAsCsvAsync(ctx, args, dispatcher, CancellationToken.None);

        Assert.Equal("list_security_findings_by_type.csv", result["filename"]!.GetValue<string>());
        Assert.Equal(1, result["total"]!.GetValue<int>());
        var stored = ArtifactStore.ReadArtifactBytes(result["artifact_id"]!.GetValue<string>());
        Assert.Contains("mixed_content", System.Text.Encoding.UTF8.GetString(stored!.Value.Bytes));
    }

    private static async Task<AuditToolsDbContext> SeedAsync(string json, int reportId = 1)
    {
        var db = NewDb();
        db.ReportPayloads.Add(new ReportPayloadRow { Id = reportId, Data = json });
        await db.SaveChangesAsync();
        return db;
    }
}
