using System.Net;
using System.Text.Json.Nodes;
using AiService.Api.Tools.Context;
using AiService.Api.Tools.Handlers.Geo;
using AiService.Api.Tools.Persistence;
using Microsoft.EntityFrameworkCore;

namespace AiService.Tests.Handlers;

/// <summary>Ports Python <c>compare/compare_slices.py::compare_geo_score_deltas</c> (classified under
/// the <c>geo</c> domain).</summary>
public sealed class GeoToolHandlersCompareTests
{
    private static AuditToolsDbContext NewDb(string? dbName = null) => new(
        new DbContextOptionsBuilder<AuditToolsDbContext>().UseInMemoryDatabase(dbName ?? Guid.NewGuid().ToString()).Options);

    private sealed class FakeHandler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
            => Task.FromResult(respond(request));
    }

    private static HttpClient FakeClient(Func<HttpRequestMessage, HttpResponseMessage> respond) => new(new FakeHandler(respond));

    [Fact]
    public async Task CompareGeoScoreDeltasAsync_requires_baseline_report_id()
    {
        await using var db = NewDb();
        var ctx = new AuditToolContext { ReportId = 1 };
        var http = FakeClient(_ => new HttpResponseMessage(HttpStatusCode.NotFound));

        var result = await GeoToolHandlers.CompareGeoScoreDeltasAsync(http, db, ctx, [], CancellationToken.None);

        Assert.Equal("baseline_report_id is required", result["error"]!.GetValue<string>());
    }

    [Fact]
    public async Task CompareGeoScoreDeltasAsync_reports_unchanged_when_all_checks_fail_identically()
    {
        var dbName = Guid.NewGuid().ToString();
        await using (var seedDb = NewDb(dbName))
        {
            seedDb.ReportPayloads.Add(new ReportPayloadRow { Id = 1, Data = """{"domain": "example.com"}""" });
            seedDb.ReportPayloads.Add(new ReportPayloadRow { Id = 2, Data = """{"domain": "example.com"}""" });
            await seedDb.SaveChangesAsync();
        }

        await using var db = NewDb(dbName);
        var ctx = new AuditToolContext { ReportId = 2 };
        var args = new JsonObject { ["baseline_report_id"] = 1 };
        // Every live check 404s for both domains, so both snapshots score 0 across the board.
        var http = FakeClient(_ => new HttpResponseMessage(HttpStatusCode.NotFound));

        var result = await GeoToolHandlers.CompareGeoScoreDeltasAsync(http, db, ctx, args, CancellationToken.None);

        Assert.Equal("example.com", result["current_domain"]!.GetValue<string>());
        Assert.Equal(0, result["total_score_delta"]!.GetValue<int>());
        Assert.False(result["regression_detected"]!.GetValue<bool>());
        var robotsDelta = result["geo_deltas"]!["robots_score"]!;
        Assert.Equal("unchanged", robotsDelta["direction"]!.GetValue<string>());
    }

    [Fact]
    public async Task CompareGeoScoreDeltasAsync_returns_error_when_geo_helper_throws()
    {
        var dbName = Guid.NewGuid().ToString();
        await using (var seedDb = NewDb(dbName))
        {
            seedDb.ReportPayloads.Add(new ReportPayloadRow { Id = 1, Data = """{"domain": "example.com"}""" });
            seedDb.ReportPayloads.Add(new ReportPayloadRow { Id = 2, Data = """{"domain": "example.com"}""" });
            await seedDb.SaveChangesAsync();
        }

        await using var db = NewDb(dbName);
        var ctx = new AuditToolContext { ReportId = 2 };
        var args = new JsonObject { ["baseline_report_id"] = 1 };
        var http = FakeClient(_ => throw new InvalidOperationException("upstream unavailable"));

        var result = await GeoToolHandlers.CompareGeoScoreDeltasAsync(http, db, ctx, args, CancellationToken.None);

        Assert.NotNull(result["error"]);
        Assert.Contains("upstream unavailable", result["error"]!.GetValue<string>(), StringComparison.Ordinal);
    }
}
