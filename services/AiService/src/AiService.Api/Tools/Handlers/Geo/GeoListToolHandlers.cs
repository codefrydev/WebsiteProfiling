using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using AiService.Api.Tools.Context;
using AiService.Api.Tools.Persistence;
using AiService.Api.Tools.Slice;
using WebsiteProfiling.Contracts.Json;

namespace AiService.Api.Tools.Handlers.Geo;

/// <summary>
/// GEO/AEO page-level list tools + robots AI-bot tier scoring — ports Python <c>geo/geo_list_tools.py</c>.
/// Reuses the fetch/scoring primitives already ported in <see cref="GeoAuditHelpers"/>
/// (<c>ScoreRobotsAiAccessAsync</c>, <c>ParseRobotsAccess</c>, <c>FetchLlmsTxtAsync</c>) rather than
/// re-deriving them.
/// </summary>
public static partial class GeoListToolHandlers
{
    private static readonly (string Type, string Prefix)[] HowtoUrlHints =
    [
        ("prefix", "/how-to"),
        ("prefix", "/howto"),
        ("prefix", "/guide/"),
        ("prefix", "/tutorial/"),
        ("prefix", "/recipes/"),
    ];

    private static bool IsSuccessStatus(JsonObject rec) => (JsonCoercion.AsString(rec["status"]) ?? "").StartsWith('2');

    private static bool HasHowtoSchema(JsonObject row)
    {
        var types = CrawlSliceHelpers.RowSchemaTypesList(row).Select(t => t.ToLowerInvariant());
        return types.Any(t => t is "howto" or "how-to" || t.Contains("howto"));
    }

    private static bool LooksLikeHowtoPage(JsonObject rec)
    {
        var url = (JsonCoercion.AsString(rec["url"]) ?? "").ToLowerInvariant();
        var heading = (JsonCoercion.AsString(rec["heading_text"]) ?? JsonCoercion.AsString(rec["h1"]) ?? "").ToLowerInvariant();
        var title = (JsonCoercion.AsString(rec["title"]) ?? "").ToLowerInvariant();
        if (HowtoUrlHints.Any(h => url.Contains(h.Prefix)))
        {
            return true;
        }

        string[] keywords = ["how to", "step-by-step", "tutorial", "guide"];
        return keywords.Any(k => heading.Contains(k) || title.Contains(k));
    }

    [GeneratedRegex(@"^\s*[-*•]\s", RegexOptions.Multiline)]
    private static partial Regex ListMarkerPattern();

    private static JsonObject AeoScore(JsonObject rec)
    {
        var excerpt = JsonCoercion.AsString(rec["content_excerpt"]) ?? "";
        var words = excerpt.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var lead = string.Join(" ", words.Take(80));
        var html = (JsonCoercion.AsString(rec["html"]) ?? "").ToLowerInvariant();
        var hasList = ListMarkerPattern().IsMatch(excerpt) || html.Contains("<li>");
        var hasDefinition = Regex.IsMatch(lead.Length > 400 ? lead[..400] : lead, @"\b(is|are|means|refers to)\b", RegexOptions.IgnoreCase);
        var wc = JsonCoercion.AsInt(rec["word_count"]) ?? 0;
        var quotability = 0;
        if (wc >= 200)
        {
            quotability += 25;
        }

        if (hasList)
        {
            quotability += 20;
        }

        if (hasDefinition)
        {
            quotability += 25;
        }

        if (GeoAuditHelpers.HasFaqSchema(rec))
        {
            quotability += 30;
        }

        var schemaTypes = CrawlSliceHelpers.RowSchemaTypesList(rec);
        if (schemaTypes.Count > 0)
        {
            quotability += 10;
        }

        return new JsonObject
        {
            ["word_count"] = wc,
            ["has_lists"] = hasList,
            ["has_definition_pattern"] = hasDefinition,
            ["quotability_score"] = Math.Min(100, quotability),
            ["schema_types"] = new JsonArray(schemaTypes.Take(5).Select(t => (JsonNode?)t).ToArray()),
        };
    }

    [GeneratedRegex(@"https?://[^\s)>]+")]
    private static partial Regex UrlPattern();

    private static HashSet<string> LlmsUrls(string llmsPreview, string llmsUrl)
    {
        var urls = new HashSet<string>();
        foreach (var line in (llmsPreview ?? "").Split('\n'))
        {
            foreach (Match match in UrlPattern().Matches(line))
            {
                urls.Add(match.Value.ToLowerInvariant());
            }
        }

        if (!string.IsNullOrEmpty(llmsUrl))
        {
            urls.Add(llmsUrl.ToLowerInvariant());
        }

        return urls;
    }

    public static async Task<JsonObject> GetRobotsAiAccessScoreAsync(
        HttpClient http,
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var domain = await scoped.ResolvePropertyDomainAsync(db, cancellationToken);
        if (string.IsNullOrEmpty(domain))
        {
            return new JsonObject { ["error"] = "domain unknown", ["robots_score"] = 0 };
        }

        var robotsUrl = new Uri(new Uri(GeoAuditHelpers.BaseUrl(domain) + "/"), "robots.txt").ToString();
        var robotsText = await GeoAuditHelpers.FetchTextAsync(http, robotsUrl, cancellationToken);
        if (string.IsNullOrWhiteSpace(robotsText))
        {
            return new JsonObject
            {
                ["domain"] = domain,
                ["robots_score"] = 0,
                ["missing"] = true,
                ["note"] = "robots.txt not reachable",
                ["provenance"] = "Crawl",
            };
        }

        var accessMap = GeoAuditHelpers.ParseRobotsAccess(robotsText);
        var tierOrder = new[] { "citation", "search", "training" };
        var perBot = GeoAuditHelpers.AiBotTiers
            .Select(kvp => new JsonObject
            {
                ["agent"] = kvp.Key,
                ["tier"] = kvp.Value,
                ["access"] = accessMap.GetValueOrDefault(kvp.Key.ToLowerInvariant(), "default"),
            })
            .OrderBy(b => Array.IndexOf(tierOrder, JsonCoercion.AsString(b["tier"])))
            .ToList();

        var result = await GeoAuditHelpers.ScoreRobotsAiAccessAsync(http, domain, cancellationToken);
        result["domain"] = domain;
        result["per_bot"] = new JsonArray(perBot.Select(b => (JsonNode?)b).ToArray());
        result["provenance"] = "Crawl";
        return result;
    }

    public static async Task<JsonObject> ListPagesMissingHowtoSchemaAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var rows = await scoped.LoadCrawlDfAsync(db, cancellationToken);
        if (rows.Count == 0)
        {
            return new JsonObject { ["pages"] = new JsonArray(), ["total"] = 0, ["truncated"] = false, ["missing"] = true };
        }

        var pages = rows
            .Where(IsSuccessStatus)
            .Where(rec => LooksLikeHowtoPage(rec) && !HasHowtoSchema(rec))
            .Select(rec => (JsonNode?)new JsonObject
            {
                ["url"] = JsonCoercion.AsString(rec["url"]) ?? "",
                ["title"] = JsonCoercion.AsString(rec["title"]) ?? "",
                ["reason"] = "howto_heuristic_no_schema",
            })
            .ToList();

        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 30, 50);
        var sliced = PayloadSliceHelpers.CapList(pages, limit, 50);
        return new JsonObject
        {
            ["pages"] = sliced["items"]?.DeepClone(),
            ["total"] = sliced["total"]?.DeepClone(),
            ["truncated"] = sliced["truncated"]?.DeepClone(),
            ["provenance"] = "Estimated",
        };
    }

    public static async Task<JsonObject> ListPagesAiCitationSignalsAsync(AuditToolsDbContext db, AuditToolContext ctx, JsonObject args, CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var rows = await scoped.LoadCrawlDfAsync(db, cancellationToken);
        if (rows.Count == 0)
        {
            return new JsonObject { ["pages"] = new JsonArray(), ["total"] = 0, ["truncated"] = false, ["missing"] = true };
        }

        var minScore = (int)JsonCoercion.Num(args["min_score"], 0);
        var scored = new List<JsonObject>();
        foreach (var rec in rows.Where(IsSuccessStatus))
        {
            var signals = AeoScore(rec);
            if (JsonCoercion.AsInt(signals["quotability_score"]) < minScore)
            {
                continue;
            }

            var entry = new JsonObject
            {
                ["url"] = JsonCoercion.AsString(rec["url"]) ?? "",
                ["title"] = JsonCoercion.AsString(rec["title"]) ?? "",
            };
            foreach (var (key, value) in signals)
            {
                entry[key] = value?.DeepClone();
            }

            scored.Add(entry);
        }

        scored = scored.OrderByDescending(p => JsonCoercion.AsInt(p["quotability_score"]) ?? 0).ToList();
        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 30, 50);
        var sliced = PayloadSliceHelpers.CapList(scored.Cast<JsonNode?>().ToList(), limit, 50);
        return new JsonObject
        {
            ["pages"] = sliced["items"]?.DeepClone(),
            ["total"] = sliced["total"]?.DeepClone(),
            ["truncated"] = sliced["truncated"]?.DeepClone(),
            ["provenance"] = "Estimated",
        };
    }

    public static async Task<JsonObject> ListPagesMissingLlmsTxtReferenceAsync(
        HttpClient http,
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var domain = await scoped.ResolvePropertyDomainAsync(db, cancellationToken);
        var llms = await GeoAuditHelpers.FetchLlmsTxtAsync(http, domain, cancellationToken);
        if (!JsonCoercion.IsTruthy(llms["found"]))
        {
            return new JsonObject
            {
                ["pages"] = new JsonArray(),
                ["total"] = 0,
                ["truncated"] = false,
                ["missing"] = true,
                ["note"] = "llms.txt not found on domain",
                ["domain"] = domain,
            };
        }

        var listed = LlmsUrls(JsonCoercion.AsString(llms["preview"]) ?? "", JsonCoercion.AsString(llms["url"]) ?? "");
        var payload = await scoped.LoadPayloadAsync(db, cancellationToken);
        var candidates = new List<string>();
        if (payload.Count > 0)
        {
            var pagesArr = payload["top_pages"] as JsonArray ?? payload["links"] as JsonArray ?? [];
            foreach (var page in pagesArr.OfType<JsonObject>())
            {
                var u = JsonCoercion.AsString(page["url"]);
                if (!string.IsNullOrEmpty(u))
                {
                    candidates.Add(u);
                }
            }
        }

        var rows = await scoped.LoadCrawlDfAsync(db, cancellationToken);
        foreach (var rec in rows.Where(IsSuccessStatus))
        {
            var u = JsonCoercion.AsString(rec["url"]);
            if (!string.IsNullOrEmpty(u))
            {
                candidates.Add(u);
            }
        }

        var seen = new HashSet<string>();
        var missing = new List<JsonNode?>();
        foreach (var url in candidates)
        {
            var norm = url.ToLowerInvariant();
            if (!seen.Add(norm))
            {
                continue;
            }

            if (listed.Contains(norm) || listed.Contains(url))
            {
                continue;
            }

            missing.Add(new JsonObject { ["url"] = url, ["llms_txt_url"] = llms["url"]?.DeepClone() });
        }

        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 30, 50);
        var sliced = PayloadSliceHelpers.CapList(missing, limit, 50);
        return new JsonObject
        {
            ["pages"] = sliced["items"]?.DeepClone(),
            ["total"] = sliced["total"]?.DeepClone(),
            ["truncated"] = sliced["truncated"]?.DeepClone(),
            ["llms_txt_url"] = llms["url"]?.DeepClone(),
            ["provenance"] = "Estimated",
        };
    }

    public static async Task<JsonObject> ListRobotsBlockedAiCrawlersAsync(
        HttpClient http,
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var domain = await scoped.ResolvePropertyDomainAsync(db, cancellationToken);
        if (string.IsNullOrEmpty(domain))
        {
            return new JsonObject { ["error"] = "domain unknown", ["agents"] = new JsonArray(), ["total"] = 0, ["truncated"] = false };
        }

        var robotsUrl = new Uri(new Uri(GeoAuditHelpers.BaseUrl(domain) + "/"), "robots.txt").ToString();
        var robotsText = await GeoAuditHelpers.FetchTextAsync(http, robotsUrl, cancellationToken);
        if (string.IsNullOrWhiteSpace(robotsText))
        {
            return new JsonObject
            {
                ["domain"] = domain,
                ["agents"] = new JsonArray(),
                ["total"] = 0,
                ["truncated"] = false,
                ["missing"] = true,
                ["note"] = "robots.txt not reachable",
            };
        }

        var accessMap = GeoAuditHelpers.ParseRobotsAccess(robotsText);
        var blocked = GeoAuditHelpers.AiBotTiers
            .Where(kvp => accessMap.GetValueOrDefault(kvp.Key.ToLowerInvariant()) == "blocked")
            .Select(kvp => (JsonNode?)new JsonObject { ["agent"] = kvp.Key, ["tier"] = kvp.Value, ["blocked"] = true, ["scope"] = "disallow: /" })
            .ToList();

        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 20, 30);
        var sliced = PayloadSliceHelpers.CapList(blocked, limit, 30);
        return new JsonObject
        {
            ["domain"] = domain,
            ["agents"] = sliced["items"]?.DeepClone(),
            ["total"] = sliced["total"]?.DeepClone(),
            ["truncated"] = sliced["truncated"]?.DeepClone(),
            ["robots_txt_checked"] = true,
            ["provenance"] = "Crawl",
        };
    }
}
