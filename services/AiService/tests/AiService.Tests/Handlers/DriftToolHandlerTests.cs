using System.Text.Json.Nodes;
using AiService.Tools.Context;
using AiService.Tools.Handlers.Drift;
using AiService.Tools.Persistence;
using Microsoft.EntityFrameworkCore;

namespace AiService.Tests.Handlers;

/// <summary>Ports Python <c>compare/compare_slices.py</c>, <c>compare/compare.py</c>,
/// <c>compare/compare_list_tools.py</c>, and <c>portfolio/health.py::get_health_history</c>.</summary>
public sealed class DriftToolHandlerTests
{
    private static AuditToolsDbContext NewDb(string? dbName = null)
    {
        var options = new DbContextOptionsBuilder<AuditToolsDbContext>()
            .UseInMemoryDatabase(dbName ?? Guid.NewGuid().ToString())
            .Options;
        return new AuditToolsDbContext(options);
    }

    private static async Task<AuditToolsDbContext> SeedPairAsync(string currentJson, string baselineJson, int currentId = 2, int baselineId = 1)
    {
        var dbName = Guid.NewGuid().ToString();
        await using (var seedDb = NewDb(dbName))
        {
            seedDb.ReportPayloads.Add(new ReportPayloadRow { Id = baselineId, Data = baselineJson });
            seedDb.ReportPayloads.Add(new ReportPayloadRow { Id = currentId, Data = currentJson });
            await seedDb.SaveChangesAsync();
        }

        return NewDb(dbName);
    }

    private static readonly JsonObject NoArgs = [];

    [Fact]
    public async Task CompareIssueDeltasAsync_requires_baseline_report_id()
    {
        await using var db = NewDb();
        var ctx = new AuditToolContext { ReportId = 1 };

        var result = await DriftToolHandlers.CompareIssueDeltasAsync(db, ctx, NoArgs, CancellationToken.None);

        Assert.Equal("baseline_report_id is required", result["error"]!.GetValue<string>());
    }

    [Fact]
    public async Task CompareIssueDeltasAsync_returns_issue_deltas_between_reports()
    {
        await using var db = await SeedPairAsync(
            """{"categories": [{"name": "seo", "issues": [{"url": "https://a", "message": "new issue", "priority": "High"}]}]}""",
            """{"categories": []}""");
        var ctx = new AuditToolContext { ReportId = 2 };
        var args = new JsonObject { ["baseline_report_id"] = 1 };

        var result = await DriftToolHandlers.CompareIssueDeltasAsync(db, ctx, args, CancellationToken.None);

        Assert.Equal(2, result["current_report_id"]!.GetValue<int>());
        Assert.Equal(1, result["baseline_report_id"]!.GetValue<int>());
        var deltas = result["issue_deltas"]!.AsArray();
        Assert.Single(deltas);
        Assert.Equal("new", deltas[0]!["kind"]!.GetValue<string>());
    }

    [Fact]
    public async Task CompareIssueDeltasAsync_returns_error_for_missing_baseline_report()
    {
        await using var db = await SeedPairAsync("""{"categories": []}""", """{"categories": []}""");
        var ctx = new AuditToolContext { ReportId = 2 };
        var args = new JsonObject { ["baseline_report_id"] = 999 };

        var result = await DriftToolHandlers.CompareIssueDeltasAsync(db, ctx, args, CancellationToken.None);

        Assert.Equal("report 999 not found", result["error"]!.GetValue<string>());
    }

    [Fact]
    public async Task CompareHealthScoreDeltaAsync_computes_delta()
    {
        await using var db = await SeedPairAsync(
            """{"categories": [{"score": 90}]}""",
            """{"categories": [{"score": 70}]}""");
        var ctx = new AuditToolContext { ReportId = 2 };
        var args = new JsonObject { ["baseline_report_id"] = 1 };

        var result = await DriftToolHandlers.CompareHealthScoreDeltaAsync(db, ctx, args, CancellationToken.None);

        Assert.Equal(90, result["health_score"]!["current"]!.GetValue<int>());
        Assert.Equal(70, result["health_score"]!["baseline"]!.GetValue<int>());
        Assert.Equal(20, result["health_score"]!["delta"]!.GetValue<int>());
    }

    [Fact]
    public async Task CompareIndexationDeltasAsync_spreads_build_result_into_response()
    {
        await using var db = await SeedPairAsync(
            """{"indexation_coverage": {"counts": {"indexed": 100}, "lists": {}}}""",
            """{"indexation_coverage": {"counts": {"indexed": 90}, "lists": {}}}""");
        var ctx = new AuditToolContext { ReportId = 2 };
        var args = new JsonObject { ["baseline_report_id"] = 1 };

        var result = await DriftToolHandlers.CompareIndexationDeltasAsync(db, ctx, args, CancellationToken.None);

        Assert.NotNull(result["count_deltas"]);
        Assert.NotNull(result["gap_deltas"]);
        Assert.Equal(2, result["current_report_id"]!.GetValue<int>());
    }

    [Fact]
    public async Task CompareUrlSetDiffAsync_returns_new_and_removed_counts_and_truncation_flags()
    {
        await using var db = await SeedPairAsync(
            """{"links": [{"url": "https://a.com/new"}]}""",
            """{"links": [{"url": "https://a.com/gone"}]}""");
        var ctx = new AuditToolContext { ReportId = 2 };
        var args = new JsonObject { ["baseline_report_id"] = 1 };

        var result = await DriftToolHandlers.CompareUrlSetDiffAsync(db, ctx, args, CancellationToken.None);

        Assert.Equal(1, result["new_count"]!.GetValue<int>());
        Assert.Equal(1, result["removed_count"]!.GetValue<int>());
        Assert.False(result["new_truncated"]!.GetValue<bool>());
    }

    [Fact]
    public async Task CompareReportsAsync_returns_full_compare_payload()
    {
        await using var db = await SeedPairAsync(
            """{"categories": [{"score": 85}]}""",
            """{"categories": [{"score": 80}]}""");
        var ctx = new AuditToolContext { ReportId = 2 };
        var args = new JsonObject { ["baseline_report_id"] = 1 };

        var result = await DriftToolHandlers.CompareReportsAsync(db, ctx, args, CancellationToken.None);

        Assert.Equal(5, result["health_score"]!["delta"]!.GetValue<int>());
        Assert.NotNull(result["category_scores"]);
        Assert.NotNull(result["truncated_sections"]);
    }

    [Fact]
    public async Task ListCompareNewIssuesAsync_filters_to_new_kind_only()
    {
        await using var db = await SeedPairAsync(
            """{"categories": [{"name": "seo", "issues": [{"url": "https://a", "message": "new"}]}]}""",
            """{"categories": [{"name": "seo", "issues": [{"url": "https://b", "message": "resolved-one"}]}]}""");
        var ctx = new AuditToolContext { ReportId = 2 };
        var args = new JsonObject { ["baseline_report_id"] = 1 };

        var result = await DriftToolHandlers.ListCompareNewIssuesAsync(db, ctx, args, CancellationToken.None);

        var issues = result["issues"]!.AsArray();
        Assert.Single(issues);
        Assert.Equal("https://a", issues[0]!["url"]!.GetValue<string>());
    }

    [Fact]
    public async Task ListCompareLighthouseRegressionsAsync_flags_pages_over_threshold()
    {
        await using var db = await SeedPairAsync(
            """{"lighthouse_by_url": {"https://a": {"median_metrics": {"performance_score": 0.5}}}}""",
            """{"lighthouse_by_url": {"https://a": {"median_metrics": {"performance_score": 0.9}}}}""");
        var ctx = new AuditToolContext { ReportId = 2 };
        var args = new JsonObject { ["baseline_report_id"] = 1 };

        var result = await DriftToolHandlers.ListCompareLighthouseRegressionsAsync(db, ctx, args, CancellationToken.None);

        var pages = result["pages"]!.AsArray();
        Assert.Single(pages);
        Assert.Equal("performance", pages[0]!["regression_type"]!.GetValue<string>());
    }

    [Fact]
    public async Task ListCompareTrafficLosersAsync_returns_missing_when_no_google_data()
    {
        await using var db = await SeedPairAsync("""{"categories": []}""", """{"categories": []}""");
        var ctx = new AuditToolContext { ReportId = 2 };
        var args = new JsonObject { ["baseline_report_id"] = 1 };

        var result = await DriftToolHandlers.ListCompareTrafficLosersAsync(db, ctx, args, CancellationToken.None);

        Assert.True(result["missing"]!.GetValue<bool>());
    }

    [Fact]
    public async Task ListCompareTrafficLosersAsync_finds_pages_with_click_declines()
    {
        await using var db = await SeedPairAsync(
            """{"google": {"gsc": {"pages": [{"page": "https://a", "clicks": 10, "impressions": 100}]}}}""",
            """{"google": {"gsc": {"pages": [{"page": "https://a", "clicks": 50, "impressions": 100}]}}}""");
        var ctx = new AuditToolContext { ReportId = 2 };
        var args = new JsonObject { ["baseline_report_id"] = 1 };

        var result = await DriftToolHandlers.ListCompareTrafficLosersAsync(db, ctx, args, CancellationToken.None);

        var pages = result["pages"]!.AsArray();
        Assert.Single(pages);
        Assert.Equal(-40, pages[0]!["click_delta"]!.GetValue<double>());
    }

    [Fact]
    public async Task GetHealthHistoryAsync_returns_snapshots_ordered_by_most_recent()
    {
        var dbName = Guid.NewGuid().ToString();
        await using (var seedDb = NewDb(dbName))
        {
            seedDb.AuditHealthSnapshots.Add(new AuditHealthSnapshotRow
            {
                Id = 1,
                PropertyId = 1,
                ReportId = 1,
                HealthScore = 70,
                GeneratedAt = DateTimeOffset.UtcNow.AddDays(-1),
                CategoryScores = """{"seo": 70}""",
                IssueCounts = """{"high": 2}""",
            });
            seedDb.AuditHealthSnapshots.Add(new AuditHealthSnapshotRow
            {
                Id = 2,
                PropertyId = 1,
                ReportId = 2,
                HealthScore = 85,
                GeneratedAt = DateTimeOffset.UtcNow,
                CategoryScores = """{"seo": 85}""",
                IssueCounts = """{"high": 1}""",
            });
            await seedDb.SaveChangesAsync();
        }

        await using var db = NewDb(dbName);
        var ctx = new AuditToolContext { PropertyId = 1 };

        var result = await DriftToolHandlers.GetHealthHistoryAsync(db, ctx, NoArgs, CancellationToken.None);

        Assert.Equal(2, result["count"]!.GetValue<int>());
        var snapshots = result["snapshots"]!.AsArray();
        Assert.Equal(85, snapshots[0]!["health_score"]!.GetValue<int>());
        Assert.Equal(70, snapshots[1]!["health_score"]!.GetValue<int>());
    }

    [Fact]
    public async Task GetHealthHistoryAsync_requires_property_id()
    {
        await using var db = NewDb();
        var ctx = new AuditToolContext();

        var result = await DriftToolHandlers.GetHealthHistoryAsync(db, ctx, NoArgs, CancellationToken.None);

        Assert.Equal("property_id is required", result["error"]!.GetValue<string>());
    }
}
