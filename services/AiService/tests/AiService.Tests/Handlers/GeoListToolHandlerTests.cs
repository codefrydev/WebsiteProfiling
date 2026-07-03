using System.Net;
using System.Text.Json.Nodes;
using AiService.Tools.Context;
using AiService.Tools.Handlers.Geo;
using AiService.Tools.Persistence;
using Microsoft.EntityFrameworkCore;

namespace AiService.Tests.Handlers;

/// <summary>Ports Python <c>geo/geo_list_tools.py</c>.</summary>
public sealed class GeoListToolHandlerTests
{
    private static AuditToolsDbContext NewDb() => new(
        new DbContextOptionsBuilder<AuditToolsDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    private static async Task<AuditToolsDbContext> SeedPropertyAndCrawlAsync(string domain, long crawlRunId, string url, string data)
    {
        var db = NewDb();
        db.Properties.Add(new PropertyRow { Id = 1, CanonicalDomain = domain });
        db.CrawlRuns.Add(new CrawlRunRow { Id = crawlRunId });
        db.CrawlResults.Add(new CrawlResultRow { Id = 1, CrawlRunId = crawlRunId, Url = url, Data = data });
        await db.SaveChangesAsync();
        return db;
    }

    private static readonly JsonObject NoArgs = [];

    private sealed class FakeHandler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
            => Task.FromResult(respond(request));
    }

    private static HttpClient FakeClient(Func<HttpRequestMessage, HttpResponseMessage> respond) => new(new FakeHandler(respond));

    [Fact]
    public async Task ListPagesMissingHowtoSchemaAsync_flags_howto_pages_without_schema()
    {
        var db = NewDb();
        db.CrawlRuns.Add(new CrawlRunRow { Id = 1 });
        db.CrawlResults.Add(new CrawlResultRow { Id = 1, CrawlRunId = 1, Url = "https://a/how-to-fix", Data = """{"status": "200", "url": "https://a/how-to-fix", "title": "How to fix it"}""" });
        await db.SaveChangesAsync();
        var ctx = new AuditToolContext();

        var result = await GeoListToolHandlers.ListPagesMissingHowtoSchemaAsync(db, ctx, NoArgs, CancellationToken.None);

        var pages = result["pages"]!.AsArray();
        Assert.Single(pages);
        Assert.Equal("howto_heuristic_no_schema", pages[0]!["reason"]!.GetValue<string>());
    }

    [Fact]
    public async Task ListPagesAiCitationSignalsAsync_scores_and_sorts_by_quotability()
    {
        var db = NewDb();
        db.CrawlRuns.Add(new CrawlRunRow { Id = 1 });
        db.CrawlResults.Add(new CrawlResultRow { Id = 1, CrawlRunId = 1, Url = "https://a", Data = """{"status": "200", "url": "https://a", "word_count": 300, "content_excerpt": "- a list\n- of items"}""" });
        db.CrawlResults.Add(new CrawlResultRow { Id = 2, CrawlRunId = 1, Url = "https://b", Data = """{"status": "200", "url": "https://b", "word_count": 10}""" });
        await db.SaveChangesAsync();
        var ctx = new AuditToolContext();

        var result = await GeoListToolHandlers.ListPagesAiCitationSignalsAsync(db, ctx, NoArgs, CancellationToken.None);

        var pages = result["pages"]!.AsArray();
        Assert.Equal(2, pages.Count);
        Assert.Equal("https://a", pages[0]!["url"]!.GetValue<string>());
    }

    [Fact]
    public async Task GetRobotsAiAccessScoreAsync_returns_error_when_domain_unknown()
    {
        await using var db = NewDb();
        var ctx = new AuditToolContext();
        var http = FakeClient(_ => new HttpResponseMessage(HttpStatusCode.NotFound));

        var result = await GeoListToolHandlers.GetRobotsAiAccessScoreAsync(http, db, ctx, NoArgs, CancellationToken.None);

        Assert.Equal("domain unknown", result["error"]!.GetValue<string>());
    }

    [Fact]
    public async Task GetRobotsAiAccessScoreAsync_builds_per_bot_breakdown_from_robots_txt()
    {
        const string robots = """
            User-agent: GPTBot
            Disallow: /

            User-agent: *
            Allow: /
            """;
        await using var db = await SeedPropertyAndCrawlAsync("example.com", 1, "https://example.com", """{"status": "200", "url": "https://example.com"}""");
        var ctx = new AuditToolContext { PropertyId = 1 };
        var http = FakeClient(_ => new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(robots) });

        var result = await GeoListToolHandlers.GetRobotsAiAccessScoreAsync(http, db, ctx, NoArgs, CancellationToken.None);

        Assert.Equal("example.com", result["domain"]!.GetValue<string>());
        var perBot = result["per_bot"]!.AsArray();
        var gptBot = perBot.Single(b => b!["agent"]!.GetValue<string>() == "GPTBot");
        Assert.Equal("blocked", gptBot!["access"]!.GetValue<string>());
    }

    [Fact]
    public async Task ListRobotsBlockedAiCrawlersAsync_returns_missing_when_robots_unreachable()
    {
        await using var db = await SeedPropertyAndCrawlAsync("example.com", 1, "https://example.com", """{"status": "200", "url": "https://example.com"}""");
        var ctx = new AuditToolContext { PropertyId = 1 };
        var http = FakeClient(_ => new HttpResponseMessage(HttpStatusCode.NotFound));

        var result = await GeoListToolHandlers.ListRobotsBlockedAiCrawlersAsync(http, db, ctx, NoArgs, CancellationToken.None);

        Assert.True(result["missing"]!.GetValue<bool>());
    }

    [Fact]
    public async Task ListRobotsBlockedAiCrawlersAsync_lists_blocked_agents()
    {
        const string robots = """
            User-agent: ClaudeBot
            Disallow: /
            """;
        await using var db = await SeedPropertyAndCrawlAsync("example.com", 1, "https://example.com", """{"status": "200", "url": "https://example.com"}""");
        var ctx = new AuditToolContext { PropertyId = 1 };
        var http = FakeClient(_ => new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(robots) });

        var result = await GeoListToolHandlers.ListRobotsBlockedAiCrawlersAsync(http, db, ctx, NoArgs, CancellationToken.None);

        var agents = result["agents"]!.AsArray();
        Assert.Contains(agents, a => a!["agent"]!.GetValue<string>() == "ClaudeBot");
    }

    [Fact]
    public async Task ListPagesMissingLlmsTxtReferenceAsync_returns_missing_when_llms_txt_not_found()
    {
        await using var db = await SeedPropertyAndCrawlAsync("example.com", 1, "https://example.com", """{"status": "200", "url": "https://example.com"}""");
        var ctx = new AuditToolContext { PropertyId = 1 };
        var http = FakeClient(_ => new HttpResponseMessage(HttpStatusCode.NotFound));

        var result = await GeoListToolHandlers.ListPagesMissingLlmsTxtReferenceAsync(http, db, ctx, NoArgs, CancellationToken.None);

        Assert.True(result["missing"]!.GetValue<bool>());
        Assert.Equal("llms.txt not found on domain", result["note"]!.GetValue<string>());
    }

    [Fact]
    public async Task ListPagesMissingLlmsTxtReferenceAsync_finds_pages_not_referenced()
    {
        await using var db = await SeedPropertyAndCrawlAsync("example.com", 1, "https://example.com/missing-page", """{"status": "200", "url": "https://example.com/missing-page"}""");
        var ctx = new AuditToolContext { PropertyId = 1 };
        var http = FakeClient(req => req.RequestUri!.AbsolutePath.EndsWith("llms.txt")
            ? new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("# Site\n\nhttps://example.com/other-page") }
            : new HttpResponseMessage(HttpStatusCode.NotFound));

        var result = await GeoListToolHandlers.ListPagesMissingLlmsTxtReferenceAsync(http, db, ctx, NoArgs, CancellationToken.None);

        var pages = result["pages"]!.AsArray();
        Assert.Single(pages);
        Assert.Equal("https://example.com/missing-page", pages[0]!["url"]!.GetValue<string>());
    }
}
