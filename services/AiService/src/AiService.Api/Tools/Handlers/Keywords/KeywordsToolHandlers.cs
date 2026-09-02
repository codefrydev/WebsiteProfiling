using System.Text.Json.Nodes;
using AiService.Api.Tools.Context;
using AiService.Api.Tools.Persistence;
using AiService.Api.Tools.Slice;
using WebsiteProfiling.Contracts.Json;

namespace AiService.Api.Tools.Handlers.Keywords;

/// <summary>
/// Keyword query/list tools — ports Python <c>keywords/keywords.py</c> and
/// <c>keywords/keyword_lists.py</c>. <c>expand_keywords</c> (Google Suggest expansion — external API
/// calls + its own Postgres cache table) is deferred, see <c>CHAT_DOTNET_MIGRATION.md</c>.
/// Note: Python has two near-duplicate "property_id missing" error shapes across its two source
/// files (with/without a "missing" key, varying wording); this port normalizes to one consistent
/// shape per return type rather than replicate that incidental drift.
/// </summary>
public static class KeywordsToolHandlers
{
    private const string NoPropertyError = "property_id is required for keyword data";

    private static JsonObject ListError(string itemKey, string error) => new()
    {
        ["error"] = error,
        [itemKey] = new JsonArray(),
        ["total"] = 0,
        ["truncated"] = false,
    };

    private static List<JsonObject> KeywordRows(JsonObject? data)
        => data?["rows"] is JsonArray rows ? rows.OfType<JsonObject>().ToList() : [];

    private static double? Position(JsonObject row)
    {
        if (row["gsc_position"] is null)
        {
            return null;
        }

        var pos = JsonCoercion.Num(row["gsc_position"], double.NaN);
        return double.IsNaN(pos) || pos <= 0 ? null : pos;
    }

    private static List<string> SerpFeatures(JsonObject row) => row["serp_features"] switch
    {
        JsonArray arr => arr
            .Select(JsonCoercion.AsString)
            .Where(f => !string.IsNullOrEmpty(f))
            .Select(f => f!.ToLowerInvariant())
            .ToList(),
        JsonValue v when JsonCoercion.AsString(v) is { Length: > 0 } s => [s.Trim().ToLowerInvariant()],
        _ => [],
    };

    private static bool HasSerpFeature(JsonObject row, params string[] needles)
    {
        var features = SerpFeatures(row);
        return features.Any(f => needles.Any(n => f.Contains(n, StringComparison.Ordinal)));
    }

    private static Dictionary<string, JsonObject> IndexKeywords(List<JsonObject> rows)
    {
        var result = new Dictionary<string, JsonObject>();
        foreach (var row in rows)
        {
            var key = (JsonCoercion.AsString(row["keyword"]) ?? JsonCoercion.AsString(row["normalized"]) ?? "").Trim().ToLowerInvariant();
            if (key.Length > 0)
            {
                result[key] = row;
            }
        }

        return result;
    }

    /// <summary>Generic filter+sort+cap over keyword rows. Mirrors Python's <c>_filter_keywords</c>/
    /// <c>_filter_keyword_rows</c>.</summary>
    private static async Task<JsonObject> FilterKeywordsAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        Func<JsonObject, bool> predicate,
        CancellationToken cancellationToken,
        Func<JsonObject, double>? sortKey = null,
        bool reverse = true)
    {
        var scoped = ctx.WithArgs(args);
        if (scoped.PropertyId is null)
        {
            return ListError("keywords", NoPropertyError);
        }

        var data = await scoped.LoadKeywordsAsync(db, cancellationToken);
        if (data is null)
        {
            return ListError("keywords", "no keyword data found");
        }

        var matches = KeywordRows(data).Where(predicate).ToList();
        if (sortKey is not null)
        {
            matches = reverse ? matches.OrderByDescending(sortKey).ToList() : matches.OrderBy(sortKey).ToList();
        }

        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 30, 50);
        var sliced = PayloadSliceHelpers.CapList(matches.Cast<JsonNode?>().ToList(), limit, 50);
        return new JsonObject { ["keywords"] = sliced["items"]?.DeepClone(), ["total"] = sliced["total"]?.DeepClone(), ["truncated"] = sliced["truncated"]?.DeepClone() };
    }

    /// <summary>Bucket lookup on a keyword_data sub-key (e.g. striking_distance, cannibalisation).
    /// Mirrors Python's <c>_keyword_bucket</c>/<c>_keyword_list_tool</c>.</summary>
    private static async Task<JsonObject> KeywordBucketAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        string key,
        string itemKey,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        if (scoped.PropertyId is null)
        {
            return ListError(itemKey, NoPropertyError);
        }

        var data = await scoped.LoadKeywordsAsync(db, cancellationToken);
        if (data is null)
        {
            return ListError(itemKey, "no keyword data found");
        }

        JsonArray items = data[key] as JsonArray ?? [];
        if (key == "semantic_keyword_clusters")
        {
            var payload = await scoped.LoadPayloadAsync(db, cancellationToken);
            items = payload["semantic_keyword_clusters"] as JsonArray ?? items;
        }

        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 30, 50);
        var sliced = PayloadSliceHelpers.CapList(items.ToList(), limit, 50);
        return new JsonObject { [itemKey] = sliced["items"]?.DeepClone(), ["total"] = sliced["total"]?.DeepClone(), ["truncated"] = sliced["truncated"]?.DeepClone() };
    }

    /// <summary>Current-vs-prior keyword_data snapshot comparison. Mirrors Python's
    /// <c>_pair_delta_tool</c>.</summary>
    private static async Task<JsonObject> PairDeltaAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        string itemKey,
        Func<JsonObject, JsonObject, List<JsonObject>> builder,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        if (scoped.PropertyId is null)
        {
            return ListError(itemKey, NoPropertyError);
        }

        var (current, prior) = await scoped.LoadKeywordSnapshotPairAsync(db, cancellationToken);
        if (current is null)
        {
            return ListError(itemKey, "no keyword data found");
        }

        if (prior is null)
        {
            return ListError(itemKey, "no prior keyword snapshot for comparison");
        }

        var rows = builder(current, prior);
        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 30, 50);
        var sliced = PayloadSliceHelpers.CapList(rows.Cast<JsonNode?>().ToList(), limit, 50);
        return new JsonObject { [itemKey] = sliced["items"]?.DeepClone(), ["total"] = sliced["total"]?.DeepClone(), ["truncated"] = sliced["truncated"]?.DeepClone() };
    }

    private static List<JsonObject> RankDeltaRows(JsonObject current, JsonObject prior, bool improved)
    {
        var curr = IndexKeywords(KeywordRows(current));
        var prev = IndexKeywords(KeywordRows(prior));
        var deltas = new List<(JsonObject Entry, double Delta)>();
        foreach (var (key, row) in curr)
        {
            if (!prev.TryGetValue(key, out var old))
            {
                continue;
            }

            var curPos = Position(row);
            var oldPos = Position(old);
            if (curPos is null || oldPos is null)
            {
                continue;
            }

            var delta = curPos.Value - oldPos.Value;
            if (improved ? delta >= 0 : delta <= 0)
            {
                continue;
            }

            deltas.Add((new JsonObject
            {
                ["keyword"] = JsonCoercion.AsString(row["keyword"]) ?? key,
                ["gsc_position"] = curPos,
                ["prior_position"] = oldPos,
                ["position_delta"] = Math.Round(delta, 2),
                ["gsc_clicks"] = row["gsc_clicks"]?.DeepClone(),
                ["gsc_impressions"] = row["gsc_impressions"]?.DeepClone(),
                ["gsc_url"] = row["gsc_url"]?.DeepClone(),
            }, delta));
        }

        return (improved ? deltas.OrderBy(d => d.Delta) : deltas.OrderByDescending(d => d.Delta))
            .Select(d => d.Entry)
            .ToList();
    }

    private static List<JsonObject> TopTenTransitions(JsonObject current, JsonObject prior, bool entered)
    {
        var curr = IndexKeywords(KeywordRows(current));
        var prev = IndexKeywords(KeywordRows(prior));
        var rows = new List<JsonObject>();
        if (entered)
        {
            foreach (var (key, row) in curr)
            {
                var curPos = Position(row);
                if (curPos is null || curPos > 10)
                {
                    continue;
                }

                var oldPos = prev.TryGetValue(key, out var old) ? Position(old) : null;
                if (oldPos is not null && oldPos <= 10)
                {
                    continue;
                }

                rows.Add(new JsonObject
                {
                    ["keyword"] = JsonCoercion.AsString(row["keyword"]) ?? key,
                    ["gsc_position"] = curPos,
                    ["prior_position"] = oldPos,
                    ["gsc_clicks"] = row["gsc_clicks"]?.DeepClone(),
                    ["gsc_impressions"] = row["gsc_impressions"]?.DeepClone(),
                });
            }
        }
        else
        {
            foreach (var (key, old) in prev)
            {
                var oldPos = Position(old);
                if (oldPos is null || oldPos > 10)
                {
                    continue;
                }

                var hasRow = curr.TryGetValue(key, out var row);
                var curPos = hasRow ? Position(row!) : null;
                if (curPos is not null && curPos <= 10)
                {
                    continue;
                }

                rows.Add(new JsonObject
                {
                    ["keyword"] = JsonCoercion.AsString(old["keyword"]) ?? key,
                    ["prior_position"] = oldPos,
                    ["gsc_position"] = curPos,
                    ["gsc_clicks"] = (hasRow ? row!["gsc_clicks"] : old["gsc_clicks"])?.DeepClone(),
                    ["gsc_impressions"] = (hasRow ? row!["gsc_impressions"] : old["gsc_impressions"])?.DeepClone(),
                });
            }
        }

        return rows.OrderByDescending(r => JsonCoercion.Num(r["gsc_impressions"])).ToList();
    }

    // ---- public tools ----

    public static async Task<JsonObject> GetKeywordSummaryAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        if (scoped.PropertyId is null)
        {
            return new JsonObject { ["error"] = NoPropertyError };
        }

        var data = await scoped.LoadKeywordsAsync(db, cancellationToken);
        if (data is null)
        {
            return new JsonObject { ["error"] = "no keyword data found", ["property_id"] = scoped.PropertyId };
        }

        var rows = KeywordRows(data);
        var striking = data["striking_distance"] as JsonArray;
        var topN = PayloadSliceHelpers.ParseLimit(args["limit"], 20, 50);
        var topRows = new JsonArray(rows.Take(topN).Select(row => (JsonNode?)new JsonObject
        {
            ["keyword"] = row["keyword"]?.DeepClone(),
            ["score"] = row["score"]?.DeepClone(),
            ["gsc_position"] = row["gsc_position"]?.DeepClone(),
            ["gsc_clicks"] = row["gsc_clicks"]?.DeepClone(),
            ["gsc_impressions"] = row["gsc_impressions"]?.DeepClone(),
            ["recommended_action"] = row["recommended_action"]?.DeepClone(),
        }).ToArray());

        return new JsonObject
        {
            ["fetched_at"] = data["fetched_at"]?.DeepClone(),
            ["total_keywords"] = data["total_keywords"]?.DeepClone() ?? rows.Count,
            ["striking_distance_count"] = striking?.Count ?? 0,
            ["top_keywords"] = topRows,
            ["property_id"] = scoped.PropertyId,
        };
    }

    public static async Task<JsonObject> SearchKeywordsAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        if (scoped.PropertyId is null)
        {
            return new JsonObject { ["error"] = NoPropertyError };
        }

        var query = (JsonCoercion.AsString(args["query"]) ?? "").Trim().ToLowerInvariant();
        if (query.Length == 0)
        {
            return new JsonObject { ["error"] = "query is required" };
        }

        var data = await scoped.LoadKeywordsAsync(db, cancellationToken);
        if (data is null)
        {
            return ListError("keywords", "no keyword data found");
        }

        var matches = KeywordRows(data)
            .Where(r => (JsonCoercion.AsString(r["keyword"]) ?? "").ToLowerInvariant().Contains(query, StringComparison.Ordinal))
            .Select(r => (JsonNode?)new JsonObject
            {
                ["keyword"] = r["keyword"]?.DeepClone(),
                ["gsc_position"] = r["gsc_position"]?.DeepClone(),
                ["gsc_clicks"] = r["gsc_clicks"]?.DeepClone(),
                ["gsc_impressions"] = r["gsc_impressions"]?.DeepClone(),
                ["recommended_action"] = r["recommended_action"]?.DeepClone(),
            })
            .ToList();

        const int limit = 30;
        return new JsonObject
        {
            ["keywords"] = new JsonArray(matches.Take(limit).ToArray()),
            ["total"] = matches.Count,
            ["truncated"] = matches.Count > limit,
        };
    }

    public static Task<JsonObject> GetStrikingDistanceKeywordsAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
        => KeywordBucketAsync(db, ctx, args, "striking_distance", "keywords", cancellationToken);

    public static Task<JsonObject> GetKeywordCannibalisationAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
        => KeywordBucketAsync(db, ctx, args, "cannibalisation", "issues", cancellationToken);

    public static Task<JsonObject> GetQueryPageMisalignmentAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
        => KeywordBucketAsync(db, ctx, args, "query_page_misalignment", "misalignments", cancellationToken);

    public static Task<JsonObject> ListCannibalisationQueriesAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
        => KeywordBucketAsync(db, ctx, args, "cannibalisation", "queries", cancellationToken);

    public static Task<JsonObject> ListMisalignedQueriesAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
        => KeywordBucketAsync(db, ctx, args, "query_page_misalignment", "misalignments", cancellationToken);

    public static async Task<JsonObject> GetKeywordHistoryAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        if (scoped.PropertyId is null)
        {
            return new JsonObject { ["error"] = "property_id is required" };
        }

        var keyword = (JsonCoercion.AsString(args["keyword"]) ?? "").Trim();
        if (keyword.Length == 0)
        {
            return new JsonObject { ["error"] = "keyword is required" };
        }

        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 30, 50);
        var history = await scoped.LoadKeywordHistoryAsync(db, keyword, limit, cancellationToken);
        return new JsonObject
        {
            ["keyword"] = keyword,
            ["history"] = new JsonArray(history.Select(h => (JsonNode?)h.DeepClone()).ToArray()),
            ["count"] = history.Count,
        };
    }

    public static async Task<JsonObject> GetKeywordSerpOverlayAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        if (scoped.PropertyId is null)
        {
            return new JsonObject { ["error"] = "property_id is required" };
        }

        var data = await scoped.LoadKeywordsAsync(db, cancellationToken);
        if (data is null)
        {
            return ListError("keywords", "no keyword data found");
        }

        var withSerp = KeywordRows(data).Where(r => r["serp_estimated_competition"] is not null).ToList();
        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 30, 50);
        var sliced = PayloadSliceHelpers.CapList(withSerp.Cast<JsonNode?>().ToList(), limit, 50);
        return new JsonObject
        {
            ["serp_overlay_count"] = data["serp_overlay_count"]?.DeepClone(),
            ["keywords"] = sliced["items"]?.DeepClone(),
            ["total"] = sliced["total"]?.DeepClone(),
            ["truncated"] = sliced["truncated"]?.DeepClone(),
        };
    }

    public static Task<JsonObject> ListKeywordsByActionAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
    {
        var action = (JsonCoercion.AsString(args["recommended_action"]) ?? "").Trim().ToLowerInvariant();
        if (action.Length == 0)
        {
            return Task.FromResult(new JsonObject { ["error"] = "recommended_action is required" });
        }

        return FilterKeywordsAsync(db, ctx, args, r => string.Equals(JsonCoercion.AsString(r["recommended_action"]), action, StringComparison.OrdinalIgnoreCase), cancellationToken);
    }

    public static Task<JsonObject> ListKeywordsByPositionAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
    {
        double? minV = null;
        double? maxV = null;
        if (args["min_position"] is { } minNode)
        {
            var v = JsonCoercion.Num(minNode, double.NaN);
            if (double.IsNaN(v))
            {
                return Task.FromResult(new JsonObject { ["error"] = "min_position and max_position must be numbers" });
            }

            minV = v;
        }

        if (args["max_position"] is { } maxNode)
        {
            var v = JsonCoercion.Num(maxNode, double.NaN);
            if (double.IsNaN(v))
            {
                return Task.FromResult(new JsonObject { ["error"] = "min_position and max_position must be numbers" });
            }

            maxV = v;
        }

        return FilterKeywordsAsync(db, ctx, args, row =>
        {
            var pos = JsonCoercion.Num(row["gsc_position"], double.NaN);
            if (double.IsNaN(pos))
            {
                return false;
            }

            if (minV is not null && pos < minV)
            {
                return false;
            }

            return maxV is null || pos <= maxV;
        }, cancellationToken);
    }

    public static Task<JsonObject> ListKeywordsByImpressionsAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
    {
        var minV = args["min_impressions"] is { } node ? (int)JsonCoercion.Num(node, 0) : 0;
        return FilterKeywordsAsync(db, ctx, args, row => JsonCoercion.Num(row["gsc_impressions"]) >= minV, cancellationToken);
    }

    public static async Task<JsonObject> GetBrandKeywordSplitAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        if (scoped.PropertyId is null)
        {
            return new JsonObject { ["error"] = "property_id is required" };
        }

        var data = await scoped.LoadKeywordsAsync(db, cancellationToken);
        if (data is null)
        {
            return new JsonObject { ["error"] = "no keyword data found", ["missing"] = true };
        }

        var rows = KeywordRows(data);
        var branded = rows.Where(r => JsonCoercion.IsTruthy(r["is_branded"])).ToList();
        var nonBranded = rows.Where(r => !JsonCoercion.IsTruthy(r["is_branded"])).ToList();
        return new JsonObject
        {
            ["brand_name"] = data["brand_name"]?.DeepClone(),
            ["branded_count"] = branded.Count,
            ["non_branded_count"] = nonBranded.Count,
            ["branded_sample"] = new JsonArray(branded.Take(10).Select(r => (JsonNode?)r.DeepClone()).ToArray()),
            ["non_branded_sample"] = new JsonArray(nonBranded.Take(10).Select(r => (JsonNode?)r.DeepClone()).ToArray()),
            ["provenance"] = "Keywords enrichment",
        };
    }

    public static Task<JsonObject> ListKeywordsByIntentAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
    {
        var intent = (JsonCoercion.AsString(args["intent"]) ?? "").Trim().ToLowerInvariant();
        if (intent.Length == 0)
        {
            return Task.FromResult(new JsonObject { ["error"] = "intent is required" });
        }

        return FilterKeywordsAsync(db, ctx, args, r => string.Equals(JsonCoercion.AsString(r["intent"]), intent, StringComparison.OrdinalIgnoreCase), cancellationToken);
    }

    public static Task<JsonObject> ListKeywordRankImprovementsAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
        => PairDeltaAsync(db, ctx, args, "keywords", (cur, prev) => RankDeltaRows(cur, prev, improved: true), cancellationToken);

    public static Task<JsonObject> ListKeywordRankDeclinesAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
        => PairDeltaAsync(db, ctx, args, "keywords", (cur, prev) => RankDeltaRows(cur, prev, improved: false), cancellationToken);

    public static Task<JsonObject> ListKeywordsNewToTop10Async(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
        => PairDeltaAsync(db, ctx, args, "keywords", (cur, prev) => TopTenTransitions(cur, prev, entered: true), cancellationToken);

    public static Task<JsonObject> ListKeywordsFellOutOfTop10Async(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
        => PairDeltaAsync(db, ctx, args, "keywords", (cur, prev) => TopTenTransitions(cur, prev, entered: false), cancellationToken);

    public static async Task<JsonObject> ListCannibalisationUrlsAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        if (scoped.PropertyId is null)
        {
            return ListError("urls", NoPropertyError);
        }

        var data = await scoped.LoadKeywordsAsync(db, cancellationToken);
        if (data is null)
        {
            return ListError("urls", "no keyword data found");
        }

        var byUrl = new Dictionary<string, (List<JsonObject> Queries, int Clicks, int Impressions)>();
        foreach (var issue in (data["cannibalisation"] as JsonArray ?? []).OfType<JsonObject>())
        {
            var query = JsonCoercion.AsString(issue["query"]) ?? "";
            foreach (var page in (issue["pages"] as JsonArray ?? []).OfType<JsonObject>())
            {
                var url = (JsonCoercion.AsString(page["url"]) ?? "").Trim();
                if (url.Length == 0)
                {
                    continue;
                }

                if (!byUrl.TryGetValue(url, out var bucket))
                {
                    bucket = ([], 0, 0);
                }

                bucket.Queries.Add(new JsonObject
                {
                    ["query"] = query,
                    ["position"] = page["position"]?.DeepClone(),
                    ["clicks"] = page["clicks"]?.DeepClone(),
                    ["impressions"] = page["impressions"]?.DeepClone(),
                });
                byUrl[url] = (bucket.Queries, bucket.Clicks + (int)JsonCoercion.Num(page["clicks"]), bucket.Impressions + (int)JsonCoercion.Num(page["impressions"]));
            }
        }

        var urls = byUrl
            .OrderByDescending(kvp => kvp.Value.Queries.Count)
            .ThenByDescending(kvp => kvp.Value.Impressions)
            .Select(kvp => (JsonNode?)new JsonObject
            {
                ["url"] = kvp.Key,
                ["queries"] = new JsonArray(kvp.Value.Queries.Select(q => (JsonNode?)q).ToArray()),
                ["query_count"] = kvp.Value.Queries.Count,
                ["total_clicks"] = kvp.Value.Clicks,
                ["total_impressions"] = kvp.Value.Impressions,
            })
            .ToList();

        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 30, 50);
        var sliced = PayloadSliceHelpers.CapList(urls, limit, 50);
        return new JsonObject { ["urls"] = sliced["items"]?.DeepClone(), ["total"] = sliced["total"]?.DeepClone(), ["truncated"] = sliced["truncated"]?.DeepClone() };
    }

    public static Task<JsonObject> ListKeywordsByRecommendedActionAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
    {
        var action = (JsonCoercion.AsString(args["recommended_action"]) ?? JsonCoercion.AsString(args["action"]) ?? "").Trim().ToLowerInvariant();
        if (action.Length == 0)
        {
            return Task.FromResult(ListError("keywords", "recommended_action is required"));
        }

        return FilterKeywordsAsync(
            db, ctx, args,
            r => (JsonCoercion.AsString(r["recommended_action"]) ?? "").ToLowerInvariant().Contains(action, StringComparison.Ordinal),
            cancellationToken,
            sortKey: r => JsonCoercion.Num(r["gsc_impressions"]));
    }

    public static Task<JsonObject> ListKeywordsBySerpFeatureAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
    {
        var feature = (JsonCoercion.AsString(args["serp_feature"]) ?? JsonCoercion.AsString(args["feature"]) ?? "").Trim().ToLowerInvariant();
        if (feature.Length == 0)
        {
            return Task.FromResult(ListError("keywords", "serp_feature is required"));
        }

        return FilterKeywordsAsync(db, ctx, args, r => HasSerpFeature(r, feature), cancellationToken, sortKey: r => JsonCoercion.Num(r["gsc_impressions"]));
    }

    private static async Task<List<JsonObject>> SemanticClustersAsync(AuditToolsDbContext db, AuditToolContext scoped, CancellationToken cancellationToken)
    {
        var payload = await scoped.LoadPayloadAsync(db, cancellationToken);
        if (payload["semantic_keyword_clusters"] is JsonArray clusters && clusters.Count > 0)
        {
            return clusters.OfType<JsonObject>().ToList();
        }

        var data = await scoped.LoadKeywordsAsync(db, cancellationToken);
        return data?["semantic_keyword_clusters"] is JsonArray fallback ? fallback.OfType<JsonObject>().ToList() : [];
    }

    public static async Task<JsonObject> ListSemanticClusterQueriesAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var clusters = await SemanticClustersAsync(db, scoped, cancellationToken);
        if (clusters.Count == 0)
        {
            return new JsonObject { ["missing"] = true, ["clusters"] = new JsonArray(), ["total"] = 0, ["truncated"] = false };
        }

        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 20, 50);
        var sliced = PayloadSliceHelpers.CapList(clusters.Cast<JsonNode?>().ToList(), limit, 50);
        return new JsonObject { ["clusters"] = sliced["items"]?.DeepClone(), ["total"] = sliced["total"]?.DeepClone(), ["truncated"] = sliced["truncated"]?.DeepClone() };
    }

    public static async Task<JsonObject> ListSemanticClusterPagesAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        if (scoped.PropertyId is null)
        {
            return ListError("clusters", NoPropertyError);
        }

        var clusters = await SemanticClustersAsync(db, scoped, cancellationToken);
        if (clusters.Count == 0)
        {
            return new JsonObject { ["missing"] = true, ["clusters"] = new JsonArray(), ["total"] = 0, ["truncated"] = false };
        }

        var kwToUrl = new Dictionary<string, string>();
        var data = await scoped.LoadKeywordsAsync(db, cancellationToken);
        foreach (var row in KeywordRows(data))
        {
            var kw = (JsonCoercion.AsString(row["keyword"]) ?? "").Trim().ToLowerInvariant();
            var url = (JsonCoercion.AsString(row["gsc_url"]) ?? "").Trim();
            if (kw.Length > 0 && url.Length > 0)
            {
                kwToUrl[kw] = url;
            }
        }

        var enriched = new List<JsonNode?>();
        foreach (var cluster in clusters)
        {
            var keywords = (cluster["keywords"] as JsonArray ?? [])
                .Select(k => (JsonCoercion.AsString(k) ?? "").Trim().ToLowerInvariant())
                .Where(k => k.Length > 0)
                .ToList();
            var pages = new Dictionary<string, List<string>>();
            foreach (var kw in keywords)
            {
                if (kwToUrl.TryGetValue(kw, out var url))
                {
                    if (!pages.TryGetValue(url, out var list))
                    {
                        list = [];
                        pages[url] = list;
                    }

                    list.Add(kw);
                }
            }

            enriched.Add(new JsonObject
            {
                ["top_keyword"] = cluster["top_keyword"]?.DeepClone() ?? cluster["representative"]?.DeepClone(),
                ["cluster_score"] = cluster["cluster_score"]?.DeepClone(),
                ["keywords"] = cluster["keywords"]?.DeepClone() ?? new JsonArray(),
                ["pages"] = new JsonArray(pages
                    .OrderByDescending(kvp => kvp.Value.Count)
                    .Select(kvp => (JsonNode?)new JsonObject
                    {
                        ["url"] = kvp.Key,
                        ["keywords"] = new JsonArray(kvp.Value.Select(k => (JsonNode?)k).ToArray()),
                        ["keyword_count"] = kvp.Value.Count,
                    }).ToArray()),
                ["page_count"] = pages.Count,
            });
        }

        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 20, 50);
        var sliced = PayloadSliceHelpers.CapList(enriched, limit, 50);
        return new JsonObject { ["clusters"] = sliced["items"]?.DeepClone(), ["total"] = sliced["total"]?.DeepClone(), ["truncated"] = sliced["truncated"]?.DeepClone() };
    }

    public static async Task<JsonObject> GetKeywordOpportunityScoreAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        if (scoped.PropertyId is null)
        {
            return new JsonObject { ["error"] = NoPropertyError, ["missing"] = true };
        }

        var keyword = (JsonCoercion.AsString(args["keyword"]) ?? "").Trim();
        if (keyword.Length == 0)
        {
            return new JsonObject { ["error"] = "keyword is required" };
        }

        var data = await scoped.LoadKeywordsAsync(db, cancellationToken);
        if (data is null)
        {
            return new JsonObject { ["error"] = "no keyword data found", ["missing"] = true };
        }

        var needle = keyword.ToLowerInvariant();
        var row = KeywordRows(data).FirstOrDefault(r => string.Equals(JsonCoercion.AsString(r["keyword"]), needle, StringComparison.OrdinalIgnoreCase));
        if (row is null)
        {
            return new JsonObject { ["error"] = "keyword not found", ["keyword"] = keyword, ["missing"] = true };
        }

        var pos = Position(row) ?? 0.0;
        var impressions = (int)JsonCoercion.Num(row["gsc_impressions"]);
        double? oppClicks = row["opportunity_clicks"] is { } oc ? JsonCoercion.Num(oc) : null;
        if (oppClicks is null && pos > 0)
        {
            // Mirrors Python's opportunity_clicks(impressions, position, target_pos=3): estimated
            // clicks gained moving to position 3, using a simple CTR-curve heuristic.
            oppClicks = EstimateOpportunityClicks(impressions, pos, targetPosition: 3);
        }

        var score = JsonCoercion.Num(row["score"]);
        var trafficPotential = (int)JsonCoercion.Num(row["traffic_potential"]);
        var composite = Math.Round(Math.Min(100.0, ((oppClicks ?? 0) * 2) + (trafficPotential / 50.0) + score), 2);
        return new JsonObject
        {
            ["keyword"] = JsonCoercion.AsString(row["keyword"]) ?? keyword,
            ["opportunity_score"] = composite,
            ["opportunity_clicks"] = oppClicks,
            ["traffic_potential"] = trafficPotential,
            ["gsc_position"] = pos > 0 ? pos : null,
            ["gsc_impressions"] = impressions,
            ["gsc_clicks"] = row["gsc_clicks"]?.DeepClone(),
            ["recommended_action"] = row["recommended_action"]?.DeepClone(),
            ["fetched_at"] = data["fetched_at"]?.DeepClone(),
        };
    }

    private static readonly double[] CtrCurve = [0.317, 0.248, 0.187, 0.136, 0.092, 0.055, 0.037, 0.026, 0.019, 0.015];

    private static double CtrAt(double position)
    {
        var idx = (int)Math.Round(position) - 1;
        return idx >= 0 && idx < CtrCurve.Length ? CtrCurve[idx] : 0.01;
    }

    private static double EstimateOpportunityClicks(int impressions, double currentPosition, double targetPosition)
    {
        var delta = CtrAt(targetPosition) - CtrAt(currentPosition);
        return Math.Max(0.0, Math.Round(impressions * delta, 1));
    }

    public static Task<JsonObject> ListKeywordsNearPageOneAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
    {
        var minPos = JsonCoercion.Num(args["min_position"], 4);
        var maxPos = JsonCoercion.Num(args["max_position"], 20);
        var minImpressions = JsonCoercion.Num(args["min_impressions"], 50);

        return FilterKeywordsAsync(
            db, ctx, args,
            row =>
            {
                var pos = Position(row);
                return pos is not null && pos >= minPos && pos <= maxPos && JsonCoercion.Num(row["gsc_impressions"]) >= minImpressions;
            },
            cancellationToken,
            sortKey: r => JsonCoercion.Num(r["gsc_impressions"]));
    }

    public static Task<JsonObject> ListKeywordsHighImpressionZeroClickAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
    {
        // A free-form impressions threshold, NOT a pagination limit — parse directly and clamp
        // only to >= 0 (mirrors Python's comment: parse_limit would wrongly reject 0 / cap large values).
        var minImpressions = Math.Max(0, (int)JsonCoercion.Num(args["min_impressions"], 100));

        return FilterKeywordsAsync(
            db, ctx, args,
            row => (int)JsonCoercion.Num(row["gsc_clicks"]) == 0 && (int)JsonCoercion.Num(row["gsc_impressions"]) >= minImpressions,
            cancellationToken,
            sortKey: r => JsonCoercion.Num(r["gsc_impressions"]));
    }

    public static Task<JsonObject> ListKeywordsByCompetitionBandAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
    {
        var minComp = JsonCoercion.Num(args["min_competition"], 0);
        var maxComp = JsonCoercion.Num(args["max_competition"], 100);

        return FilterKeywordsAsync(
            db, ctx, args,
            row =>
            {
                if (row["serp_estimated_competition"] is null)
                {
                    return false;
                }

                var val = JsonCoercion.Num(row["serp_estimated_competition"], double.NaN);
                return !double.IsNaN(val) && val >= minComp && val <= maxComp;
            },
            cancellationToken,
            sortKey: r => JsonCoercion.Num(r["serp_estimated_competition"]),
            reverse: false);
    }

    public static async Task<JsonObject> GetKeywordSerpSnapshotAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        if (scoped.PropertyId is null)
        {
            return new JsonObject { ["error"] = NoPropertyError, ["missing"] = true };
        }

        var keyword = (JsonCoercion.AsString(args["keyword"]) ?? "").Trim();
        if (keyword.Length == 0)
        {
            return new JsonObject { ["error"] = "keyword is required" };
        }

        var data = await scoped.LoadKeywordsAsync(db, cancellationToken);
        if (data is null)
        {
            return new JsonObject { ["error"] = "no keyword data found", ["missing"] = true };
        }

        var needle = keyword.ToLowerInvariant();
        var row = KeywordRows(data).FirstOrDefault(r => string.Equals(JsonCoercion.AsString(r["keyword"]), needle, StringComparison.OrdinalIgnoreCase));
        if (row is null)
        {
            return new JsonObject { ["error"] = "keyword not found", ["keyword"] = keyword, ["missing"] = true };
        }

        return new JsonObject
        {
            ["keyword"] = JsonCoercion.AsString(row["keyword"]) ?? keyword,
            ["serp_features"] = row["serp_features"]?.DeepClone(),
            ["serp_estimated_competition"] = row["serp_estimated_competition"]?.DeepClone(),
            ["serp_organic_count"] = row["serp_organic_count"]?.DeepClone(),
            ["serp_provenance"] = row["serp_provenance"]?.DeepClone() ?? "Estimated",
            ["gsc_position"] = row["gsc_position"]?.DeepClone(),
            ["gsc_impressions"] = row["gsc_impressions"]?.DeepClone(),
            ["fetched_at"] = data["fetched_at"]?.DeepClone(),
        };
    }

    public static Task<JsonObject> ListKeywordsWithAiOverviewAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
        => FilterKeywordsAsync(
            db, ctx, args,
            r => HasSerpFeature(r, "ai_overview", "answer_box", "featured_snippet", "knowledge_graph"),
            cancellationToken,
            sortKey: r => JsonCoercion.Num(r["gsc_impressions"]));

    public static Task<JsonObject> ListKeywordsLocalPackAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
        => FilterKeywordsAsync(db, ctx, args, r => HasSerpFeature(r, "local_pack", "local", "map"), cancellationToken, sortKey: r => JsonCoercion.Num(r["gsc_impressions"]));

    public static Task<JsonObject> ListKeywordsQuestionIntentAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
        => FilterKeywordsAsync(db, ctx, args, r => JsonCoercion.IsTruthy(r["is_question"]), cancellationToken, sortKey: r => JsonCoercion.Num(r["gsc_impressions"]));

    private static readonly HashSet<string> CommercialIntents = new(StringComparer.OrdinalIgnoreCase) { "commercial", "transactional" };

    public static Task<JsonObject> ListKeywordsCommercialIntentAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
        => FilterKeywordsAsync(db, ctx, args, r => CommercialIntents.Contains(JsonCoercion.AsString(r["intent"]) ?? ""), cancellationToken, sortKey: r => JsonCoercion.Num(r["gsc_impressions"]));
}
