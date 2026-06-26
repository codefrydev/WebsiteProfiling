using System.Text.Json;
using System.Text.RegularExpressions;
using ReportService.Application.Repositories;

namespace ReportService.Application.Build;

/// <summary>Shared helpers ported from Python reporting/categories/_helpers.py.</summary>
public static partial class CategoryHelpers
{
    public const int ResponseTimeSlowMs = 2000;
    public const int RedirectChainLong = 2;

    private static readonly Dictionary<string, int> PriorityOrder = new(StringComparer.Ordinal)
    {
        ["Critical"] = 0,
        ["High"] = 1,
        ["Medium"] = 2,
        ["Low"] = 3,
    };

    public static CategoryIssue Issue(
        string message,
        string? url = null,
        string priority = "Medium",
        string recommendation = "") =>
        new(message, url ?? "", priority, recommendation);

    public static List<CategoryIssue> SortIssues(IEnumerable<CategoryIssue> issues) =>
        issues.OrderBy(i => PriorityOrder.GetValueOrDefault(i.Priority, 99)).ToList();

    public static int ScoreDeductions(int maxScore, IEnumerable<(int Amount, bool Apply)> deductions)
    {
        var total = deductions.Where(d => d.Apply).Sum(d => d.Amount);
        return Math.Max(0, maxScore - total);
    }

    public static bool IsSuccessStatus(string? status) =>
        !string.IsNullOrWhiteSpace(status) && Status2Xx().IsMatch(status.Trim());

    public static IReadOnlyList<CrawlRow> SuccessRows(IReadOnlyList<CrawlRow> rows) =>
        rows.Where(r => IsSuccessStatus(r.Status)).ToList();

    public static Dictionary<string, object?> ParsePageAnalysis(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw) || raw == "{}")
        {
            return new Dictionary<string, object?>();
        }

        try
        {
            using var doc = JsonDocument.Parse(raw);
            if (doc.RootElement.ValueKind != JsonValueKind.Object)
            {
                return new Dictionary<string, object?>();
            }

            var dict = new Dictionary<string, object?>();
            foreach (var prop in doc.RootElement.EnumerateObject())
            {
                dict[prop.Name] = prop.Value.ValueKind switch
                {
                    JsonValueKind.String => prop.Value.GetString(),
                    JsonValueKind.True => true,
                    JsonValueKind.False => false,
                    JsonValueKind.Array => prop.Value,
                    JsonValueKind.Object => prop.Value,
                    JsonValueKind.Number => prop.Value.TryGetInt64(out var n) ? n : prop.Value.GetDouble(),
                    _ => null,
                };
            }

            return dict;
        }
        catch (JsonException)
        {
            return new Dictionary<string, object?>();
        }
    }

    public static List<CategoryIssue> HreflangIssues(IReadOnlyList<CrawlRow> successRows)
    {
        var issues = new List<CategoryIssue>();
        foreach (var row in successRows)
        {
            if (string.IsNullOrWhiteSpace(row.PageAnalysisJson))
            {
                continue;
            }

            List<(string Lang, string Href)> alternates;
            try
            {
                using var doc = JsonDocument.Parse(row.PageAnalysisJson);
                if (!doc.RootElement.TryGetProperty("hreflang_alternates", out var altArray)
                    || altArray.ValueKind != JsonValueKind.Array)
                {
                    continue;
                }

                alternates = [];
                foreach (var alt in altArray.EnumerateArray())
                {
                    if (alt.ValueKind != JsonValueKind.Object)
                    {
                        continue;
                    }

                    var lang = (alt.TryGetProperty("hreflang", out var hl) ? hl.GetString()
                        : alt.TryGetProperty("lang", out var l) ? l.GetString() : null) ?? "";
                    var href = (alt.TryGetProperty("href", out var hrefEl) ? hrefEl.GetString() : null) ?? "";
                    alternates.Add((lang.Trim().ToLowerInvariant(), href.Trim()));
                }
            }
            catch (JsonException)
            {
                continue;
            }

            if (alternates.Count == 0)
            {
                continue;
            }

            var url = row.Url.Trim();
            var langs = alternates.Select(a => a.Lang).ToList();
            var hrefs = alternates.Select(a => a.Href).ToList();

            if (langs.Count > 0 && langs.Count != langs.Distinct().Count())
            {
                issues.Add(Issue(
                    "Duplicate hreflang language codes on page.",
                    url,
                    "High",
                    "Each hreflang alternate should use a unique language/region code."));
                break;
            }

            if (!string.IsNullOrEmpty(url) && hrefs.Count > 0
                && !hrefs.Select(h => h.Trim().TrimEnd('/')).Contains(url.Trim().TrimEnd('/')))
            {
                issues.Add(Issue(
                    "Hreflang cluster missing self-referencing alternate.",
                    url,
                    "Medium",
                    "Include a hreflang link pointing to this page URL."));
                break;
            }
        }

        return issues;
    }

    public static List<CategoryIssue> Soft404Issues(IReadOnlyList<CrawlRow> successRows)
    {
        var issues = new List<CategoryIssue>();
        string[] markers = ["not found", "404", "page not found", "doesn't exist", "does not exist"];
        foreach (var row in successRows)
        {
            var title = (row.Title ?? "").ToLowerInvariant();
            if (!markers.Any(m => title.Contains(m, StringComparison.Ordinal)))
            {
                continue;
            }

            issues.Add(Issue(
                "Possible soft 404: page returns 200 but title suggests not found.",
                row.Url,
                "High",
                "Return 404 status or redirect to a relevant page."));
            if (issues.Count >= 10)
            {
                break;
            }
        }

        return issues;
    }

    public static List<CategoryIssue> BrokenLinkSources(
        IReadOnlyList<(string From, string To)> edges,
        HashSet<string> brokenUrls)
    {
        var issues = new List<CategoryIssue>();
        if (brokenUrls.Count == 0)
        {
            return issues;
        }

        var sources = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        foreach (var (src, tgt) in edges)
        {
            if (brokenUrls.Contains(tgt))
            {
                sources.TryAdd(tgt, []);
                sources[tgt].Add(src);
            }
        }

        foreach (var (tgt, srcs) in sources.Take(15))
        {
            var sample = string.Join(", ", srcs.Take(3));
            var more = srcs.Count > 3 ? $" (+{srcs.Count - 3} more)" : "";
            issues.Add(Issue(
                $"Broken URL linked from {srcs.Count} page(s): {sample}{more}",
                tgt,
                "High",
                "Fix or remove links pointing to this URL."));
        }

        return issues;
    }

    public static List<CategoryIssue> IndexationCoverageIssues(
        IReadOnlyList<CrawlRow> rows,
        IReadOnlyDictionary<string, object?>? indexation)
    {
        var issues = new List<CategoryIssue>();
        if (indexation is null)
        {
            return issues;
        }

        if (indexation.TryGetValue("lists", out var listsObj)
            && listsObj is JsonElement listsEl
            && listsEl.ValueKind == JsonValueKind.Object
            && listsEl.TryGetProperty("sitemap_only", out var sitemapOnly)
            && sitemapOnly.ValueKind == JsonValueKind.Array)
        {
            var count = 0;
            foreach (var urlEl in sitemapOnly.EnumerateArray())
            {
                if (count >= 15)
                {
                    break;
                }

                var url = urlEl.GetString() ?? "";
                issues.Add(Issue(
                    $"URL in sitemap but not crawled: {url}",
                    url,
                    "High",
                    "Verify the URL is linked internally, not blocked by robots, and within crawl scope."));
                count++;
            }
        }

        return issues;
    }

    public static void MergeIndexationIssues(
        IList<ReportCategory> categories,
        IReadOnlyList<CrawlRow> rows,
        IReadOnlyDictionary<string, object?>? indexation)
    {
        var extra = IndexationCoverageIssues(rows, indexation);
        if (extra.Count == 0)
        {
            return;
        }

        for (var i = 0; i < categories.Count; i++)
        {
            if (categories[i].Id != "technical_seo")
            {
                continue;
            }

            var merged = SortIssues(categories[i].Issues.Concat(extra));
            categories[i] = categories[i] with
            {
                Issues = merged,
                Recommendations = merged.Select(x => x.Recommendation).Where(r => !string.IsNullOrEmpty(r)).Distinct().ToList(),
            };
            break;
        }
    }

    public static List<string> RecommendationsFromIssues(IEnumerable<CategoryIssue> issues) =>
        issues.Select(i => i.Recommendation).Where(r => !string.IsNullOrWhiteSpace(r)).Distinct().ToList();

    public static List<CategoryIssue> SchemaIssues(IReadOnlyList<CrawlRow> successRows)
    {
        var issues = new List<CategoryIssue>();
        var invalid = 0;
        foreach (var row in successRows)
        {
            if (row.HasSchema != true)
            {
                continue;
            }

            var schemas = GetSchemaTypes(row.PageAnalysisJson);
            if (schemas.Count > 0)
            {
                continue;
            }

            invalid++;
            if (invalid == 1)
            {
                issues.Add(Issue(
                    "Structured data present but could not parse JSON-LD @type.",
                    row.Url,
                    "Low",
                    "Validate JSON-LD with Google Rich Results Test."));
            }
        }

        return issues;
    }

    public static List<CategoryIssue> OrphanHubSuggestions(
        IReadOnlyList<(string From, string To)> edges,
        IReadOnlyList<string> orphanUrls)
    {
        var issues = new List<CategoryIssue>();
        if (edges.Count == 0 || orphanUrls.Count == 0)
        {
            return issues;
        }

        var inDeg = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var (_, tgt) in edges)
        {
            inDeg[tgt] = inDeg.GetValueOrDefault(tgt) + 1;
        }

        var hubLabel = inDeg.OrderByDescending(kv => kv.Value).Select(kv => kv.Key).FirstOrDefault() ?? "";
        foreach (var orphan in orphanUrls.Take(10))
        {
            var message = string.IsNullOrEmpty(hubLabel)
                ? "Orphan page (no inlinks)."
                : $"Orphan page (no inlinks). Consider linking from hub page: {hubLabel}";
            issues.Add(Issue(
                message,
                orphan,
                "Medium",
                "Add internal links from category or hub pages to this URL."));
        }

        return issues;
    }

    public static Dictionary<string, object?> ParsePageAnalysisCell(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return new Dictionary<string, object?>();
        }

        try
        {
            using var doc = JsonDocument.Parse(raw);
            if (doc.RootElement.ValueKind != JsonValueKind.Object)
            {
                return new Dictionary<string, object?>();
            }

            var dict = new Dictionary<string, object?>();
            foreach (var prop in doc.RootElement.EnumerateObject())
            {
                dict[prop.Name] = prop.Value.ValueKind switch
                {
                    JsonValueKind.String => prop.Value.GetString(),
                    JsonValueKind.True => true,
                    JsonValueKind.False => false,
                    JsonValueKind.Array => prop.Value.GetRawText(),
                    JsonValueKind.Object => prop.Value.GetRawText(),
                    JsonValueKind.Number => prop.Value.TryGetDouble(out var d) ? d : null,
                    _ => null,
                };
            }

            return dict;
        }
        catch (JsonException)
        {
            return new Dictionary<string, object?>();
        }
    }

    private static List<string> GetSchemaTypes(string? pageAnalysisJson)
    {
        var pa = ParsePageAnalysisCell(pageAnalysisJson);
        if (!pa.TryGetValue("json_ld_types", out var typesObj) && !pa.TryGetValue("schema_types", out typesObj))
        {
            return [];
        }

        return typesObj switch
        {
            string s when !string.IsNullOrWhiteSpace(s) => [s],
            JsonElement { ValueKind: JsonValueKind.Array } el => el.EnumerateArray()
                .Select(v => v.GetString() ?? "")
                .Where(s => !string.IsNullOrWhiteSpace(s))
                .ToList(),
            string raw when raw.StartsWith('[') => TryParseSchemaArray(raw),
            _ => [],
        };
    }

    private static List<string> TryParseSchemaArray(string raw)
    {
        try
        {
            using var doc = JsonDocument.Parse(raw);
            if (doc.RootElement.ValueKind != JsonValueKind.Array)
            {
                return [];
            }

            return doc.RootElement.EnumerateArray()
                .Select(v => v.GetString() ?? "")
                .Where(s => !string.IsNullOrWhiteSpace(s))
                .ToList();
        }
        catch (JsonException)
        {
            return [];
        }
    }

    [GeneratedRegex(@"^2\d{2}$")]
    private static partial Regex Status2Xx();
}
