using System.Text.Json.Nodes;
using AiService.Tools.Context;
using AiService.Tools.Handlers.Geo;
using AiService.Tools.Persistence;
using Microsoft.EntityFrameworkCore;

namespace AiService.Tests.Handlers;

/// <summary>Ports Python <c>geo/geo_citability.py</c>.</summary>
public sealed class GeoCitabilityToolHandlerTests
{
    private static AuditToolsDbContext NewDb() => new(
        new DbContextOptionsBuilder<AuditToolsDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    private static async Task<AuditToolsDbContext> SeedCrawlAsync(long crawlRunId, string url, string data)
    {
        var db = NewDb();
        db.CrawlRuns.Add(new CrawlRunRow { Id = crawlRunId });
        db.CrawlResults.Add(new CrawlResultRow { Id = 1, CrawlRunId = crawlRunId, Url = url, Data = data });
        await db.SaveChangesAsync();
        return db;
    }

    private static readonly JsonObject NoArgs = [];

    private const string RichContent = """
        According to a recent study, 42% of developers use REST APIs daily. "This is a well-cited fact,"
        say researchers at https://nature.com/articles/example. APIs are a standard method for services
        to communicate over HTTP, and they typically return structured JSON responses.
        """;

    [Fact]
    public async Task GetCitabilityScoreAsync_scores_content_rich_pages_higher_than_empty()
    {
        await using var db = await SeedCrawlAsync(1, "https://a", $$"""
            {"status": "200", "url": "https://a", "word_count": 400,
             "content_excerpt": {{System.Text.Json.JsonSerializer.Serialize(RichContent)}}}
            """);
        var ctx = new AuditToolContext();

        var result = await GeoCitabilityToolHandlers.GetCitabilityScoreAsync(db, ctx, NoArgs, CancellationToken.None);

        Assert.Equal(1, result["total_pages"]!.GetValue<int>());
        Assert.True(result["citability_score"]!.GetValue<double>() > 0);
    }

    [Fact]
    public async Task GetCitabilityScoreAsync_returns_missing_when_no_crawl_data()
    {
        await using var db = NewDb();
        var ctx = new AuditToolContext();

        var result = await GeoCitabilityToolHandlers.GetCitabilityScoreAsync(db, ctx, NoArgs, CancellationToken.None);

        Assert.True(result["missing"]!.GetValue<bool>());
    }

    [Fact]
    public async Task GetCitabilityForUrlAsync_requires_url_argument()
    {
        await using var db = NewDb();
        var ctx = new AuditToolContext();

        var result = await GeoCitabilityToolHandlers.GetCitabilityForUrlAsync(db, ctx, NoArgs, CancellationToken.None);

        Assert.Equal("url is required", result["error"]!.GetValue<string>());
    }

    [Fact]
    public async Task GetCitabilityForUrlAsync_returns_signals_for_known_url()
    {
        await using var db = await SeedCrawlAsync(1, "https://a", $$"""
            {"status": "200", "url": "https://a", "title": "Example", "word_count": 400,
             "content_excerpt": {{System.Text.Json.JsonSerializer.Serialize(RichContent)}}}
            """);
        var ctx = new AuditToolContext();
        var args = new JsonObject { ["url"] = "https://a" };

        var result = await GeoCitabilityToolHandlers.GetCitabilityForUrlAsync(db, ctx, args, CancellationToken.None);

        Assert.Equal("https://a", result["url"]!.GetValue<string>());
        Assert.NotNull(result["signals"]);
    }

    [Fact]
    public async Task GetCitabilityForUrlAsync_returns_error_for_unknown_url()
    {
        await using var db = await SeedCrawlAsync(1, "https://a", """{"status": "200", "url": "https://a"}""");
        var ctx = new AuditToolContext();
        var args = new JsonObject { ["url"] = "https://unknown" };

        var result = await GeoCitabilityToolHandlers.GetCitabilityForUrlAsync(db, ctx, args, CancellationToken.None);

        Assert.Equal("url not found in crawl", result["error"]!.GetValue<string>());
    }
}
