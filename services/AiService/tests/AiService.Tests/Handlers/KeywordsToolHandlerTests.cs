using System.Text.Json.Nodes;
using AiService.Api.Tools.Context;
using AiService.Api.Tools.Handlers.Keywords;
using AiService.Api.Tools.Persistence;
using Microsoft.EntityFrameworkCore;

namespace AiService.Tests.Handlers;

/// <summary>Ports Python <c>tools/audit_tools/keywords/keywords.py</c> and
/// <c>keyword_lists.py</c> (excluding <c>expand_keywords</c>, deferred — see
/// CHAT_DOTNET_MIGRATION.md).</summary>
public sealed class KeywordsToolHandlerTests
{
    private static AuditToolsDbContext NewDb(string? dbName = null)
    {
        var options = new DbContextOptionsBuilder<AuditToolsDbContext>()
            .UseInMemoryDatabase(dbName ?? Guid.NewGuid().ToString())
            .Options;
        return new AuditToolsDbContext(options);
    }

    private static async Task<AuditToolsDbContext> SeedKeywordDataAsync(int propertyId, string json, long id = 1)
    {
        var db = NewDb();
        db.KeywordData.Add(new KeywordDataRow { Id = id, PropertyId = propertyId, Data = json });
        await db.SaveChangesAsync();
        return db;
    }

    private static readonly JsonObject NoArgs = [];

    [Fact]
    public async Task GetKeywordSummaryAsync_returns_top_keywords_and_counts()
    {
        await using var db = await SeedKeywordDataAsync(1, """
            {"total_keywords": 2, "striking_distance": [{}],
             "rows": [{"keyword": "a", "score": 5, "gsc_position": 8}, {"keyword": "b", "score": 3}]}
            """);
        var ctx = new AuditToolContext { PropertyId = 1 };

        var result = await KeywordsToolHandlers.GetKeywordSummaryAsync(db, ctx, NoArgs, CancellationToken.None);

        Assert.Equal(2, result["total_keywords"]!.GetValue<int>());
        Assert.Equal(1, result["striking_distance_count"]!.GetValue<int>());
        Assert.Equal(2, result["top_keywords"]!.AsArray().Count);
    }

    [Fact]
    public async Task GetKeywordSummaryAsync_requires_property_id()
    {
        await using var db = NewDb();
        var ctx = new AuditToolContext();

        var result = await KeywordsToolHandlers.GetKeywordSummaryAsync(db, ctx, NoArgs, CancellationToken.None);

        Assert.Equal("property_id is required for keyword data", result["error"]!.GetValue<string>());
    }

    [Fact]
    public async Task SearchKeywordsAsync_matches_substring_case_insensitively()
    {
        await using var db = await SeedKeywordDataAsync(1, """
            {"rows": [{"keyword": "Best Shoes"}, {"keyword": "socks"}]}
            """);
        var ctx = new AuditToolContext { PropertyId = 1 };
        var args = new JsonObject { ["query"] = "shoe" };

        var result = await KeywordsToolHandlers.SearchKeywordsAsync(db, ctx, args, CancellationToken.None);

        Assert.Equal(1, result["total"]!.GetValue<int>());
        Assert.Equal("Best Shoes", result["keywords"]!.AsArray()[0]!["keyword"]!.GetValue<string>());
    }

    [Fact]
    public async Task GetStrikingDistanceKeywordsAsync_returns_bucket_capped()
    {
        await using var db = await SeedKeywordDataAsync(1, """{"striking_distance": [{"keyword": "a"}, {"keyword": "b"}]}""");
        var ctx = new AuditToolContext { PropertyId = 1 };

        var result = await KeywordsToolHandlers.GetStrikingDistanceKeywordsAsync(db, ctx, NoArgs, CancellationToken.None);

        Assert.Equal(2, result["total"]!.GetValue<int>());
        Assert.Equal(2, result["keywords"]!.AsArray().Count);
    }

    [Fact]
    public async Task ListCannibalisationQueriesAsync_returns_cannibalisation_bucket_as_queries()
    {
        await using var db = await SeedKeywordDataAsync(1, """{"cannibalisation": [{"query": "shoes"}]}""");
        var ctx = new AuditToolContext { PropertyId = 1 };

        var result = await KeywordsToolHandlers.ListCannibalisationQueriesAsync(db, ctx, NoArgs, CancellationToken.None);

        Assert.Single(result["queries"]!.AsArray());
    }

    [Fact]
    public async Task ListKeywordsByActionAsync_filters_exact_match()
    {
        await using var db = await SeedKeywordDataAsync(1, """
            {"rows": [{"keyword": "a", "recommended_action": "Improve CTR"}, {"keyword": "b", "recommended_action": "Monitor"}]}
            """);
        var ctx = new AuditToolContext { PropertyId = 1 };
        var args = new JsonObject { ["recommended_action"] = "improve ctr" };

        var result = await KeywordsToolHandlers.ListKeywordsByActionAsync(db, ctx, args, CancellationToken.None);

        Assert.Single(result["keywords"]!.AsArray());
        Assert.Equal("a", result["keywords"]!.AsArray()[0]!["keyword"]!.GetValue<string>());
    }

    [Fact]
    public async Task ListKeywordsByActionAsync_requires_recommended_action()
    {
        await using var db = NewDb();
        var ctx = new AuditToolContext { PropertyId = 1 };

        var result = await KeywordsToolHandlers.ListKeywordsByActionAsync(db, ctx, NoArgs, CancellationToken.None);

        Assert.Equal("recommended_action is required", result["error"]!.GetValue<string>());
    }

    [Fact]
    public async Task ListKeywordsByPositionAsync_filters_by_range()
    {
        await using var db = await SeedKeywordDataAsync(1, """
            {"rows": [{"keyword": "a", "gsc_position": 5}, {"keyword": "b", "gsc_position": 15}]}
            """);
        var ctx = new AuditToolContext { PropertyId = 1 };
        var args = new JsonObject { ["min_position"] = 1, ["max_position"] = 10 };

        var result = await KeywordsToolHandlers.ListKeywordsByPositionAsync(db, ctx, args, CancellationToken.None);

        Assert.Single(result["keywords"]!.AsArray());
    }

    [Fact]
    public async Task ListKeywordsByRecommendedActionAsync_sorts_by_impressions_descending()
    {
        await using var db = await SeedKeywordDataAsync(1, """
            {"rows": [
                {"keyword": "low", "recommended_action": "fix title", "gsc_impressions": 10},
                {"keyword": "high", "recommended_action": "fix title", "gsc_impressions": 500}
            ]}
            """);
        var ctx = new AuditToolContext { PropertyId = 1 };
        var args = new JsonObject { ["recommended_action"] = "fix" };

        var result = await KeywordsToolHandlers.ListKeywordsByRecommendedActionAsync(db, ctx, args, CancellationToken.None);

        var keywords = result["keywords"]!.AsArray();
        Assert.Equal(2, keywords.Count);
        Assert.Equal("high", keywords[0]!["keyword"]!.GetValue<string>());
    }

    [Fact]
    public async Task ListKeywordsByCompetitionBandAsync_sorts_ascending()
    {
        await using var db = await SeedKeywordDataAsync(1, """
            {"rows": [
                {"keyword": "hard", "serp_estimated_competition": 80},
                {"keyword": "easy", "serp_estimated_competition": 20}
            ]}
            """);
        var ctx = new AuditToolContext { PropertyId = 1 };

        var result = await KeywordsToolHandlers.ListKeywordsByCompetitionBandAsync(db, ctx, NoArgs, CancellationToken.None);

        var keywords = result["keywords"]!.AsArray();
        Assert.Equal("easy", keywords[0]!["keyword"]!.GetValue<string>());
    }

    [Fact]
    public async Task ListKeywordsBySerpFeatureAsync_matches_feature_substring()
    {
        await using var db = await SeedKeywordDataAsync(1, """
            {"rows": [{"keyword": "a", "serp_features": ["ai_overview"], "gsc_impressions": 5}]}
            """);
        var ctx = new AuditToolContext { PropertyId = 1 };
        var args = new JsonObject { ["serp_feature"] = "ai_overview" };

        var result = await KeywordsToolHandlers.ListKeywordsBySerpFeatureAsync(db, ctx, args, CancellationToken.None);

        Assert.Single(result["keywords"]!.AsArray());
    }

    [Fact]
    public async Task GetBrandKeywordSplitAsync_splits_branded_and_non_branded()
    {
        await using var db = await SeedKeywordDataAsync(1, """
            {"brand_name": "Acme", "rows": [{"keyword": "acme shoes", "is_branded": true}, {"keyword": "shoes", "is_branded": false}]}
            """);
        var ctx = new AuditToolContext { PropertyId = 1 };

        var result = await KeywordsToolHandlers.GetBrandKeywordSplitAsync(db, ctx, NoArgs, CancellationToken.None);

        Assert.Equal("Acme", result["brand_name"]!.GetValue<string>());
        Assert.Equal(1, result["branded_count"]!.GetValue<int>());
        Assert.Equal(1, result["non_branded_count"]!.GetValue<int>());
    }

    [Fact]
    public async Task ListCannibalisationUrlsAsync_aggregates_by_url()
    {
        await using var db = await SeedKeywordDataAsync(1, """
            {"cannibalisation": [
                {"query": "shoes", "pages": [
                    {"url": "https://a", "clicks": 3, "impressions": 100},
                    {"url": "https://a", "clicks": 2, "impressions": 50}
                ]}
            ]}
            """);
        var ctx = new AuditToolContext { PropertyId = 1 };

        var result = await KeywordsToolHandlers.ListCannibalisationUrlsAsync(db, ctx, NoArgs, CancellationToken.None);

        var urls = result["urls"]!.AsArray();
        Assert.Single(urls);
        Assert.Equal(2, urls[0]!["query_count"]!.GetValue<int>());
        Assert.Equal(5, urls[0]!["total_clicks"]!.GetValue<int>());
    }

    [Fact]
    public async Task GetKeywordOpportunityScoreAsync_returns_error_for_unknown_keyword()
    {
        await using var db = await SeedKeywordDataAsync(1, """{"rows": [{"keyword": "known"}]}""");
        var ctx = new AuditToolContext { PropertyId = 1 };
        var args = new JsonObject { ["keyword"] = "unknown" };

        var result = await KeywordsToolHandlers.GetKeywordOpportunityScoreAsync(db, ctx, args, CancellationToken.None);

        Assert.Equal("keyword not found", result["error"]!.GetValue<string>());
    }

    [Fact]
    public async Task GetKeywordOpportunityScoreAsync_computes_composite_score()
    {
        await using var db = await SeedKeywordDataAsync(1, """
            {"rows": [{"keyword": "shoes", "gsc_position": 8, "gsc_impressions": 1000, "score": 10, "traffic_potential": 200}]}
            """);
        var ctx = new AuditToolContext { PropertyId = 1 };
        var args = new JsonObject { ["keyword"] = "shoes" };

        var result = await KeywordsToolHandlers.GetKeywordOpportunityScoreAsync(db, ctx, args, CancellationToken.None);

        Assert.Equal("shoes", result["keyword"]!.GetValue<string>());
        Assert.True(result["opportunity_score"]!.GetValue<double>() > 0);
    }

    [Fact]
    public async Task GetKeywordSerpSnapshotAsync_returns_row_fields_for_known_keyword()
    {
        await using var db = await SeedKeywordDataAsync(1, """
            {"rows": [{"keyword": "shoes", "serp_estimated_competition": 42, "gsc_position": 5}]}
            """);
        var ctx = new AuditToolContext { PropertyId = 1 };
        var args = new JsonObject { ["keyword"] = "shoes" };

        var result = await KeywordsToolHandlers.GetKeywordSerpSnapshotAsync(db, ctx, args, CancellationToken.None);

        Assert.Equal(42, result["serp_estimated_competition"]!.GetValue<int>());
        Assert.Equal("Estimated", result["serp_provenance"]!.GetValue<string>());
    }

    [Fact]
    public async Task ListSemanticClusterQueriesAsync_reads_from_payload_first()
    {
        var dbName = Guid.NewGuid().ToString();
        await using (var seedDb = NewDb(dbName))
        {
            seedDb.KeywordData.Add(new KeywordDataRow { Id = 1, PropertyId = 1, Data = "{}" });
            seedDb.ReportPayloads.Add(new ReportPayloadRow { Id = 1, Data = """{"semantic_keyword_clusters": [{"top_keyword": "shoes"}]}""" });
            await seedDb.SaveChangesAsync();
        }

        await using var db = NewDb(dbName);
        var ctx = new AuditToolContext { PropertyId = 1, ReportId = 1 };

        var result = await KeywordsToolHandlers.ListSemanticClusterQueriesAsync(db, ctx, NoArgs, CancellationToken.None);

        Assert.Single(result["clusters"]!.AsArray());
    }

    [Fact]
    public async Task ListKeywordRankImprovementsAsync_computes_delta_between_snapshots()
    {
        var dbName = Guid.NewGuid().ToString();
        await using (var seedDb = NewDb(dbName))
        {
            // Id ordering matters: LoadKeywordsAsync/ReadKeywordSnapshotAsync treat the HIGHEST id as
            // "current" and the next-highest as "prior" — id=1 is the older/prior snapshot here.
            seedDb.KeywordData.Add(new KeywordDataRow
            {
                Id = 1,
                PropertyId = 1,
                Data = """{"rows": [{"keyword": "shoes", "gsc_position": 10, "gsc_impressions": 90}]}""",
            });
            seedDb.KeywordData.Add(new KeywordDataRow
            {
                Id = 2,
                PropertyId = 1,
                Data = """{"rows": [{"keyword": "shoes", "gsc_position": 3, "gsc_impressions": 100}]}""",
            });
            await seedDb.SaveChangesAsync();
        }

        await using var db = NewDb(dbName);
        var ctx = new AuditToolContext { PropertyId = 1 };

        var result = await KeywordsToolHandlers.ListKeywordRankImprovementsAsync(db, ctx, NoArgs, CancellationToken.None);

        var keywords = result["keywords"]!.AsArray();
        Assert.Single(keywords);
        Assert.Equal("shoes", keywords[0]!["keyword"]!.GetValue<string>());
        Assert.Equal(-7, keywords[0]!["position_delta"]!.GetValue<double>());
    }

    [Fact]
    public async Task ListKeywordRankImprovementsAsync_errors_without_prior_snapshot()
    {
        await using var db = await SeedKeywordDataAsync(1, """{"rows": [{"keyword": "shoes", "gsc_position": 3}]}""");
        var ctx = new AuditToolContext { PropertyId = 1 };

        var result = await KeywordsToolHandlers.ListKeywordRankImprovementsAsync(db, ctx, NoArgs, CancellationToken.None);

        Assert.Equal("no prior keyword snapshot for comparison", result["error"]!.GetValue<string>());
    }

    [Fact]
    public async Task ListKeywordsNewToTop10Async_finds_keywords_entering_top_10()
    {
        var dbName = Guid.NewGuid().ToString();
        await using (var seedDb = NewDb(dbName))
        {
            // id=1 is prior (outside top 10), id=2 is current (entered top 10) — see note above.
            seedDb.KeywordData.Add(new KeywordDataRow
            {
                Id = 1,
                PropertyId = 1,
                Data = """{"rows": [{"keyword": "shoes", "gsc_position": 15}]}""",
            });
            seedDb.KeywordData.Add(new KeywordDataRow
            {
                Id = 2,
                PropertyId = 1,
                Data = """{"rows": [{"keyword": "shoes", "gsc_position": 8, "gsc_impressions": 100}]}""",
            });
            await seedDb.SaveChangesAsync();
        }

        await using var db = NewDb(dbName);
        var ctx = new AuditToolContext { PropertyId = 1 };

        var result = await KeywordsToolHandlers.ListKeywordsNewToTop10Async(db, ctx, NoArgs, CancellationToken.None);

        Assert.Single(result["keywords"]!.AsArray());
    }

    [Fact]
    public async Task GetKeywordHistoryAsync_returns_time_series_oldest_first()
    {
        var dbName = Guid.NewGuid().ToString();
        await using (var seedDb = NewDb(dbName))
        {
            seedDb.KeywordHistory.Add(new KeywordHistoryRow { Id = 1, PropertyId = 1, Keyword = "shoes", FetchedAt = DateTimeOffset.UtcNow.AddDays(-2), Position = 10 });
            seedDb.KeywordHistory.Add(new KeywordHistoryRow { Id = 2, PropertyId = 1, Keyword = "shoes", FetchedAt = DateTimeOffset.UtcNow.AddDays(-1), Position = 5 });
            await seedDb.SaveChangesAsync();
        }

        await using var db = NewDb(dbName);
        var ctx = new AuditToolContext { PropertyId = 1 };
        var args = new JsonObject { ["keyword"] = "shoes" };

        var result = await KeywordsToolHandlers.GetKeywordHistoryAsync(db, ctx, args, CancellationToken.None);

        Assert.Equal(2, result["count"]!.GetValue<int>());
        var history = result["history"]!.AsArray();
        Assert.Equal(10, history[0]!["position"]!.GetValue<double>());
        Assert.Equal(5, history[1]!["position"]!.GetValue<double>());
    }

    [Fact]
    public async Task GetKeywordHistoryAsync_requires_keyword()
    {
        await using var db = NewDb();
        var ctx = new AuditToolContext { PropertyId = 1 };

        var result = await KeywordsToolHandlers.GetKeywordHistoryAsync(db, ctx, NoArgs, CancellationToken.None);

        Assert.Equal("keyword is required", result["error"]!.GetValue<string>());
    }

    [Fact]
    public async Task ListKeywordsQuestionIntentAsync_filters_is_question_rows()
    {
        await using var db = await SeedKeywordDataAsync(1, """
            {"rows": [{"keyword": "how to tie shoes", "is_question": true, "gsc_impressions": 20}, {"keyword": "shoes", "is_question": false}]}
            """);
        var ctx = new AuditToolContext { PropertyId = 1 };

        var result = await KeywordsToolHandlers.ListKeywordsQuestionIntentAsync(db, ctx, NoArgs, CancellationToken.None);

        Assert.Single(result["keywords"]!.AsArray());
    }

    [Fact]
    public async Task ListKeywordsCommercialIntentAsync_matches_commercial_and_transactional()
    {
        await using var db = await SeedKeywordDataAsync(1, """
            {"rows": [
                {"keyword": "buy shoes", "intent": "transactional", "gsc_impressions": 5},
                {"keyword": "what are shoes", "intent": "informational"}
            ]}
            """);
        var ctx = new AuditToolContext { PropertyId = 1 };

        var result = await KeywordsToolHandlers.ListKeywordsCommercialIntentAsync(db, ctx, NoArgs, CancellationToken.None);

        Assert.Single(result["keywords"]!.AsArray());
    }

    [Fact]
    public async Task ListKeywordsHighImpressionZeroClickAsync_filters_zero_click_high_impression()
    {
        await using var db = await SeedKeywordDataAsync(1, """
            {"rows": [
                {"keyword": "a", "gsc_clicks": 0, "gsc_impressions": 500},
                {"keyword": "b", "gsc_clicks": 3, "gsc_impressions": 500}
            ]}
            """);
        var ctx = new AuditToolContext { PropertyId = 1 };

        var result = await KeywordsToolHandlers.ListKeywordsHighImpressionZeroClickAsync(db, ctx, NoArgs, CancellationToken.None);

        Assert.Single(result["keywords"]!.AsArray());
        Assert.Equal("a", result["keywords"]!.AsArray()[0]!["keyword"]!.GetValue<string>());
    }

    [Fact]
    public async Task ListKeywordsByIntentAsync_returns_no_keyword_data_error()
    {
        await using var db = NewDb();
        var ctx = new AuditToolContext { PropertyId = 1 };
        var args = new JsonObject { ["intent"] = "informational" };

        var result = await KeywordsToolHandlers.ListKeywordsByIntentAsync(db, ctx, args, CancellationToken.None);

        Assert.Equal("no keyword data found", result["error"]!.GetValue<string>());
    }
}
