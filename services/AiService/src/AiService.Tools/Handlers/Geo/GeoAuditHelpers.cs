using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using AiService.Tools.Slice;
using WebsiteProfiling.Contracts.Json;

namespace AiService.Tools.Handlers.Geo;

/// <summary>Shared GEO/AEO audit helpers — ports Python <c>geo/geo_tools.py</c> and <c>geo/geo_list_tools.py</c>.</summary>
public static class GeoAuditHelpers
{
    private static readonly HashSet<string> FaqTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "faqpage", "qapage", "question",
    };

    private static readonly (int Threshold, string Label)[] ScoreBands =
    [
        (86, "Excellent"),
        (68, "Good"),
        (36, "Foundation"),
        (0, "Critical"),
    ];

    internal static readonly IReadOnlyDictionary<string, string> AiBotTiers = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["GPTBot"] = "citation",
        ["OAI-SearchBot"] = "citation",
        ["ChatGPT-User"] = "citation",
        ["ClaudeBot"] = "citation",
        ["anthropic-ai"] = "citation",
        ["PerplexityBot"] = "citation",
        ["Perplexity-User"] = "citation",
        ["Google-Extended"] = "search",
        ["Googlebot"] = "search",
        ["Bingbot"] = "search",
        ["BingPreview"] = "search",
        ["DuckDuckBot"] = "search",
        ["Applebot"] = "search",
        ["Applebot-Extended"] = "search",
        ["CCBot"] = "training",
        ["Bytespider"] = "training",
        ["FacebookBot"] = "training",
        ["Amazonbot"] = "training",
        ["meta-externalagent"] = "training",
        ["meta-externalfetcher"] = "training",
        ["Diffbot"] = "training",
        ["ImagesiftBot"] = "training",
        ["omgili"] = "training",
        ["omgilibot"] = "training",
        ["Timpibot"] = "training",
        ["DataForSeoBot"] = "training",
        ["PiplBot"] = "training",
    };

    private static readonly (string Key, string Path)[] AiDiscoveryPaths =
    [
        ("ai_txt", "/.well-known/ai.txt"),
        ("ai_summary_json", "/ai/summary.json"),
        ("ai_faq_json", "/ai/faq.json"),
        ("ai_service_json", "/ai/service.json"),
    ];

    public static string ScoreBand(double score)
    {
        foreach (var (threshold, label) in ScoreBands)
        {
            if (score >= threshold)
            {
                return label;
            }
        }

        return "Critical";
    }

    internal static string BaseUrl(string domain)
    {
        if (string.IsNullOrWhiteSpace(domain))
        {
            return "";
        }

        var host = Regex.Replace(domain.Trim(), "^https?://", "", RegexOptions.IgnoreCase).Split('/')[0];
        return $"https://{host}";
    }

    public static bool HasFaqSchema(JsonObject row)
    {
        foreach (var type in CrawlSliceHelpers.RowSchemaTypesList(row))
        {
            var lower = type.ToLowerInvariant();
            if (FaqTypes.Contains(lower) || lower.Contains("faq", StringComparison.Ordinal))
            {
                return true;
            }
        }

        return false;
    }

    internal static async Task<JsonObject> FetchLlmsTxtAsync(HttpClient http, string domain, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(domain))
        {
            return new JsonObject { ["found"] = false, ["error"] = "domain unknown" };
        }

        var baseUrl = BaseUrl(domain);
        string[] paths = ["/llms.txt", "/.well-known/llms.txt"];
        foreach (var path in paths)
        {
            var url = new Uri(new Uri(baseUrl + "/"), path.TrimStart('/')).ToString();
            var text = await FetchTextAsync(http, url, ct);
            if (!string.IsNullOrWhiteSpace(text))
            {
                var depth = ScoreLlmsTxtDepth(text);
                return new JsonObject
                {
                    ["found"] = true,
                    ["url"] = url,
                    ["status_code"] = 200,
                    ["size_bytes"] = System.Text.Encoding.UTF8.GetByteCount(text),
                    ["preview"] = text.Length > 500 ? text[..500] : text,
                    ["depth"] = depth,
                };
            }
        }

        var checkedUrls = new JsonArray(paths.Select(p => JsonValue.Create(new Uri(new Uri(baseUrl + "/"), p.TrimStart('/')).ToString())).ToArray());
        return new JsonObject { ["found"] = false, ["checked_urls"] = checkedUrls };
    }

    internal static JsonObject ScoreLlmsTxtDepth(string text)
    {
        var lines = text.Split('\n');
        var hasH1 = lines.Any(l => l.StartsWith("# ", StringComparison.Ordinal));
        var hasBlockquote = lines.Any(l => l.StartsWith("> ", StringComparison.Ordinal));
        var sectionCount = lines.Count(l => l.StartsWith("## ", StringComparison.Ordinal));
        var linkCount = Regex.Matches(text, @"https?://[^\s)>]+").Count;
        var points = 0;
        if (hasH1)
        {
            points += 4;
        }

        if (hasBlockquote)
        {
            points += 3;
        }

        if (sectionCount >= 2)
        {
            points += 4;
        }
        else if (sectionCount == 1)
        {
            points += 2;
        }

        if (linkCount >= 5)
        {
            points += 4;
        }
        else if (linkCount >= 2)
        {
            points += 2;
        }
        else if (linkCount >= 1)
        {
            points += 1;
        }

        if (linkCount >= 10)
        {
            points += 3;
        }

        return new JsonObject
        {
            ["has_h1"] = hasH1,
            ["has_blockquote"] = hasBlockquote,
            ["section_count"] = sectionCount,
            ["link_count"] = linkCount,
            ["depth_score"] = Math.Min(18, points),
        };
    }

    internal static async Task<bool> FetchLlmsFullTxtAsync(HttpClient http, string baseUrl, CancellationToken ct)
    {
        string[] paths = ["/llms-full.txt", "/.well-known/llms-full.txt"];
        foreach (var path in paths)
        {
            var url = new Uri(new Uri(baseUrl + "/"), path.TrimStart('/')).ToString();
            var text = await FetchTextAsync(http, url, ct);
            if (!string.IsNullOrWhiteSpace(text))
            {
                return true;
            }
        }

        return false;
    }

    internal static async Task<JsonObject> FetchAiDiscoveryAsync(HttpClient http, string domain, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(domain))
        {
            return new JsonObject { ["found_count"] = 0, ["endpoints"] = new JsonObject(), ["error"] = "domain unknown" };
        }

        var baseUrl = BaseUrl(domain);
        var endpoints = new JsonObject();
        var foundCount = 0;
        foreach (var (key, path) in AiDiscoveryPaths)
        {
            var url = new Uri(new Uri(baseUrl + "/"), path.TrimStart('/')).ToString();
            var text = await FetchTextAsync(http, url, ct);
            if (!string.IsNullOrWhiteSpace(text))
            {
                endpoints[key] = new JsonObject
                {
                    ["found"] = true,
                    ["url"] = url,
                    ["size_bytes"] = System.Text.Encoding.UTF8.GetByteCount(text),
                };
                foundCount++;
            }
            else
            {
                endpoints[key] = new JsonObject { ["found"] = false, ["url"] = url };
            }
        }

        var score = foundCount > 0 ? Math.Min(6, foundCount * 2) : 0;
        return new JsonObject
        {
            ["found_count"] = foundCount,
            ["endpoints"] = endpoints,
            ["discovery_score"] = score,
        };
    }

    internal static async Task<JsonObject> ScoreMetaSignalsAsync(HttpClient http, string domain, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(domain))
        {
            return new JsonObject { ["meta_score"] = 0, ["checked"] = false };
        }

        var html = await FetchTextAsync(http, BaseUrl(domain), ct) ?? "";
        if (html.Length == 0)
        {
            return new JsonObject { ["meta_score"] = 0, ["checked"] = false };
        }

        var hasTitle = Regex.IsMatch(html, @"<title[^>]*>[^<]{3,}</title>", RegexOptions.IgnoreCase);
        var hasDesc = Regex.IsMatch(html, @"<meta[^>]+name=[""']description[""'][^>]+content=[""'][^""']{10,}", RegexOptions.IgnoreCase);
        var hasCanonical = Regex.IsMatch(html, @"<link[^>]+rel=[""']canonical[""']", RegexOptions.IgnoreCase);
        var hasOgTitle = Regex.IsMatch(html, @"<meta[^>]+property=[""']og:title[""']", RegexOptions.IgnoreCase);
        var hasOgDesc = Regex.IsMatch(html, @"<meta[^>]+property=[""']og:description[""']", RegexOptions.IgnoreCase);
        var hasOgImage = Regex.IsMatch(html, @"<meta[^>]+property=[""']og:image[""']", RegexOptions.IgnoreCase);
        var points = 0;
        if (hasTitle)
        {
            points += 4;
        }

        if (hasDesc)
        {
            points += 3;
        }

        if (hasCanonical)
        {
            points += 3;
        }

        if (hasOgTitle)
        {
            points += 1;
        }

        if (hasOgDesc)
        {
            points += 1;
        }

        if (hasOgImage)
        {
            points += 2;
        }

        return new JsonObject
        {
            ["meta_score"] = Math.Min(14, points),
            ["has_title"] = hasTitle,
            ["has_meta_description"] = hasDesc,
            ["has_canonical"] = hasCanonical,
            ["has_og_title"] = hasOgTitle,
            ["has_og_description"] = hasOgDesc,
            ["has_og_image"] = hasOgImage,
            ["checked"] = true,
        };
    }

    internal static async Task<JsonObject> ScoreFreshnessSignalsAsync(HttpClient http, string domain, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(domain))
        {
            return new JsonObject { ["freshness_score"] = 0, ["checked"] = false };
        }

        var baseUrl = BaseUrl(domain);
        var hasSitemap = false;
        var hasFeed = false;
        var hasDateModified = false;
        foreach (var path in new[] { "/sitemap.xml", "/sitemap_index.xml" })
        {
            var text = await FetchTextAsync(http, new Uri(new Uri(baseUrl + "/"), path.TrimStart('/')).ToString(), ct);
            if (text is not null && text.Contains("<url", StringComparison.OrdinalIgnoreCase))
            {
                hasSitemap = true;
                if (text.Contains("lastmod", StringComparison.OrdinalIgnoreCase))
                {
                    hasDateModified = true;
                }

                break;
            }
        }

        foreach (var path in new[] { "/feed", "/feed.xml", "/rss.xml", "/atom.xml", "/feed/" })
        {
            var text = await FetchTextAsync(http, new Uri(new Uri(baseUrl + "/"), path.TrimStart('/')).ToString(), ct);
            if (text is not null && (text.Contains("<rss", StringComparison.OrdinalIgnoreCase)
                || text.Contains("<feed", StringComparison.OrdinalIgnoreCase)))
            {
                hasFeed = true;
                break;
            }
        }

        var points = 0;
        if (hasSitemap)
        {
            points += 2;
        }

        if (hasFeed)
        {
            points += 2;
        }

        if (hasDateModified)
        {
            points += 2;
        }

        return new JsonObject
        {
            ["freshness_score"] = Math.Min(6, points),
            ["has_sitemap"] = hasSitemap,
            ["has_rss_atom_feed"] = hasFeed,
            ["has_date_modified_in_sitemap"] = hasDateModified,
            ["checked"] = true,
        };
    }

    internal static async Task<JsonObject> ScoreRobotsAiAccessAsync(HttpClient http, string domain, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(domain))
        {
            return new JsonObject { ["robots_score"] = 0, ["checked"] = false };
        }

        var url = new Uri(new Uri(BaseUrl(domain) + "/"), "robots.txt").ToString();
        var robotsText = await FetchTextAsync(http, url, ct);
        if (robotsText is null)
        {
            return new JsonObject { ["robots_score"] = 0, ["checked"] = false, ["error"] = "robots.txt not reachable" };
        }

        if (robotsText.Trim().Length == 0)
        {
            return new JsonObject { ["robots_score"] = 0, ["checked"] = true, ["missing"] = true };
        }

        var accessMap = ParseRobotsAccess(robotsText);
        var citationBots = AiBotTiers.Where(kvp => kvp.Value == "citation").Select(kvp => kvp.Key).ToList();
        var searchBots = AiBotTiers.Where(kvp => kvp.Value == "search").Select(kvp => kvp.Key).ToList();
        var trainingBots = AiBotTiers.Where(kvp => kvp.Value == "training").Select(kvp => kvp.Key).ToList();

        var citationScore = citationBots.Count > 0
            ? (int)Math.Round(citationBots.Count(b => accessMap.GetValueOrDefault(b.ToLowerInvariant()) != "blocked") / (double)citationBots.Count * 9)
            : 0;
        var searchScore = searchBots.Count > 0
            ? (int)Math.Round(searchBots.Count(b => accessMap.GetValueOrDefault(b.ToLowerInvariant()) != "blocked") / (double)searchBots.Count * 6)
            : 0;
        var trainingScore = trainingBots.Count > 0
            ? (int)Math.Round(trainingBots.Count(b => accessMap.GetValueOrDefault(b.ToLowerInvariant()) != "blocked") / (double)trainingBots.Count * 3)
            : 0;
        var score = Math.Min(18, citationScore + searchScore + trainingScore);

        return new JsonObject
        {
            ["robots_score"] = score,
            ["citation_bots_score"] = citationScore,
            ["search_bots_score"] = searchScore,
            ["training_bots_score"] = trainingScore,
            ["checked"] = true,
        };
    }

    public static Dictionary<string, string> ParseRobotsAccess(string robotsText)
    {
        var sections = new List<(List<string> Agents, List<string> Allows, List<string> Disallows)>();
        var currentAgents = new List<string>();
        var currentAllows = new List<string>();
        var currentDisallows = new List<string>();

        void Flush()
        {
            if (currentAgents.Count > 0)
            {
                sections.Add(([..currentAgents], [..currentAllows], [..currentDisallows]));
            }
        }

        foreach (var rawLine in robotsText.Split('\n'))
        {
            var line = rawLine.Trim();
            if (line.Length == 0 || line.StartsWith('#'))
            {
                continue;
            }

            var lower = line.ToLowerInvariant();
            if (lower.StartsWith("user-agent:", StringComparison.Ordinal))
            {
                if (currentAllows.Count > 0 || currentDisallows.Count > 0)
                {
                    Flush();
                    currentAgents = [];
                    currentAllows = [];
                    currentDisallows = [];
                }

                currentAgents.Add(line.Split(':', 2)[1].Trim());
            }
            else if (lower.StartsWith("allow:", StringComparison.Ordinal))
            {
                currentAllows.Add(line.Split(':', 2)[1].Trim());
            }
            else if (lower.StartsWith("disallow:", StringComparison.Ordinal))
            {
                currentDisallows.Add(line.Split(':', 2)[1].Trim());
            }
        }

        Flush();

        string AgentAccess(string agent)
        {
            var agentL = agent.ToLowerInvariant();
            var specific = new List<(List<string> Allows, List<string> Disallows)>();
            var wildcard = new List<(List<string> Allows, List<string> Disallows)>();
            foreach (var (agents, allows, disallows) in sections)
            {
                var agentsLower = agents.Select(a => a.ToLowerInvariant()).ToList();
                if (agentsLower.Contains(agentL))
                {
                    specific.Add((allows, disallows));
                }
                else if (agentsLower.Contains("*"))
                {
                    wildcard.Add((allows, disallows));
                }
            }

            var applicable = specific.Count > 0 ? specific : wildcard;
            if (applicable.Count == 0)
            {
                return "default";
            }

            foreach (var (allows, disallows) in applicable)
            {
                var rootBlocked = disallows.Contains("/");
                var rootAllowed = allows.Contains("/");
                if (rootBlocked && !rootAllowed)
                {
                    return "blocked";
                }
            }

            return "allowed";
        }

        var access = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var agent in AiBotTiers.Keys)
        {
            access[agent.ToLowerInvariant()] = AgentAccess(agent);
        }

        return access;
    }

    private static async Task<string?> FetchTextAsync(HttpClient http, string url, CancellationToken ct)
    {
        try
        {
            using var response = await http.GetAsync(url, ct);
            if (!response.IsSuccessStatusCode)
            {
                return null;
            }

            var text = await response.Content.ReadAsStringAsync(ct);
            return string.IsNullOrWhiteSpace(text) ? null : text;
        }
        catch (HttpRequestException)
        {
            return null;
        }
        catch (TaskCanceledException)
        {
            return null;
        }
    }
}
