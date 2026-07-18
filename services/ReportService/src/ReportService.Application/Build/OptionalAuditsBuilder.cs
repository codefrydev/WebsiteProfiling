using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;
using ReportService.Application.Repositories;

namespace ReportService.Application.Build;

/// <summary>Port of Python reporting/optional_audits.py — pagination, spell, HTML, AMP, Wayback, axe.</summary>
public static class OptionalAuditsBuilder
{
    private static readonly Regex WordRegex = new(@"[a-zA-Z']{4,}", RegexOptions.Compiled);
    private static readonly Regex TitleTagRegex = new("<title", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex HtmlOpenRegex = new("<html[^>]*>", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex HtmlCloseRegex = new("</html>", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex IdAttrRegex = new("""\bid=["']([^"']+)["']""", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    public static async Task<(IReadOnlyList<ReportCategory> Categories, Dictionary<string, object?> Meta)> ApplyAsync(
        IList<ReportCategory> categories,
        IReadOnlyList<CrawlRow> rows,
        IReadOnlyDictionary<string, string>? config,
        long? crawlRunId,
        CrawlPageHtmlReader? htmlReader,
        IHttpClientFactory? httpClientFactory,
        CancellationToken cancellationToken = default,
        ILogger? logger = null)
    {
        var meta = new Dictionary<string, object?>();
        var cfg = config ?? new Dictionary<string, string>();

        var pagination = PaginationIssues(rows);
        if (pagination.Count > 0)
        {
            CategoryHelpers.MergeIssuesIntoCategory(categories, "technical_seo", pagination);
            meta["pagination_issues"] = pagination.Count;
        }

        if (ParseBool(cfg, "enable_spell_check", defaultValue: false))
        {
            var (spellIssues, skipReason) = SpellCheckIssues(rows);
            if (!string.IsNullOrEmpty(skipReason))
            {
                meta["spell_check_skipped"] = skipReason;
            }

            if (spellIssues.Count > 0)
            {
                CategoryHelpers.MergeIssuesIntoCategory(categories, "intelligence", spellIssues);
                meta["spell_check_pages"] = spellIssues.Count;
            }
        }

        if (ParseBool(cfg, "enable_html_validation", defaultValue: false))
        {
            var (htmlIssues, usedParser) = await HtmlValidationIssuesAsync(
                rows,
                crawlRunId,
                htmlReader,
                cancellationToken);
            meta["html_validation_parser"] = usedParser ? "html5lib" : "regex";
            if (htmlIssues.Count > 0)
            {
                CategoryHelpers.MergeIssuesIntoCategory(categories, "technical_seo", htmlIssues);
                meta["html_validation_pages"] = htmlIssues.Count;
            }
        }

        if (ParseBool(cfg, "enable_amp_audit", defaultValue: false))
        {
            var amp = AmpAuditIssues(rows);
            if (amp.Count > 0)
            {
                CategoryHelpers.MergeIssuesIntoCategory(categories, "technical_seo", amp);
                meta["amp_audit_issues"] = amp.Count;
            }
        }

        if (ParseBool(cfg, "enable_wayback_lookup", defaultValue: false))
        {
            var wb = await WaybackIssuesAsync(rows, httpClientFactory, cancellationToken, logger: logger);
            if (wb.Count > 0)
            {
                CategoryHelpers.MergeIssuesIntoCategory(categories, "technical_seo", wb);
                meta["wayback_404_checked"] = wb.Count;
            }
        }

        if (ParseBool(cfg, "enable_axe", defaultValue: false))
        {
            var renderMode = cfg.GetValueOrDefault("crawl_render_mode")?.Trim().ToLowerInvariant() ?? "static";
            if (renderMode == "static")
            {
                meta["axe_skipped"] = "enable_axe requires javascript or auto crawl rendering";
            }
            else
            {
                var axe = AxeIssuesFromRows(rows);
                if (axe.Count > 0)
                {
                    CategoryHelpers.MergeIssuesIntoCategory(categories, "html_accessibility", axe);
                    meta["axe_violation_count"] = axe.Count;
                }
            }
        }

        return (categories.ToList(), meta);
    }

    internal static List<CategoryIssue> PaginationIssues(IReadOnlyList<CrawlRow> rows)
    {
        var issues = new List<CategoryIssue>();
        if (rows.Count == 0)
        {
            return issues;
        }

        var orphanPrev = 0;
        var ampMismatch = 0;
        foreach (var row in rows)
        {
            var url = row.Url?.Trim() ?? "";
            if (url.Length == 0)
            {
                continue;
            }

            var (relNext, relPrev, amphtml) = ParsePagination(row.PageAnalysisJson);
            if (!string.IsNullOrWhiteSpace(relPrev) && string.IsNullOrWhiteSpace(relNext))
            {
                orphanPrev++;
            }

            if (!string.IsNullOrWhiteSpace(amphtml)
                && !string.IsNullOrWhiteSpace(row.CanonicalUrl)
                && !string.Equals(amphtml.Trim(), row.CanonicalUrl.Trim(), StringComparison.Ordinal))
            {
                ampMismatch++;
            }
        }

        if (orphanPrev > 0)
        {
            issues.Add(CategoryHelpers.Issue(
                $"{orphanPrev} page(s) have rel=prev without rel=next (pagination chain may be broken).",
                priority: "Medium",
                recommendation: "Ensure paginated series use paired rel=next and rel=prev links."));
        }

        if (ampMismatch > 0)
        {
            issues.Add(CategoryHelpers.Issue(
                $"{ampMismatch} page(s) have amphtml link that does not match canonical.",
                priority: "Medium",
                recommendation: "Pair AMP and canonical URLs correctly for mobile/desktop variants."));
        }

        return issues;
    }

    internal static (List<CategoryIssue> Issues, string? SkipReason) SpellCheckIssues(
        IReadOnlyList<CrawlRow> rows,
        int maxPages = 50)
    {
        var issues = new List<CategoryIssue>();
        var (checker, skipReason) = SpellCheckerFactory.GetOrCreate();
        if (checker is null)
        {
            return (issues, skipReason);
        }

        var checkedCount = 0;
        foreach (var row in rows)
        {
            if (checkedCount >= maxPages)
            {
                break;
            }

            if (!CategoryHelpers.IsSuccessStatus(row.Status))
            {
                continue;
            }

            var excerpt = SpellTextParts(row).Trim();
            if (excerpt.Length < 40)
            {
                continue;
            }

            var words = WordRegex.Matches(excerpt.ToLowerInvariant())
                .Select(m => m.Value)
                .Take(120)
                .ToList();
            if (words.Count == 0)
            {
                continue;
            }

            checkedCount++;
            var unknown = words.Where(w => !checker.Check(w)).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
            if (unknown.Count >= 3)
            {
                var sample = string.Join(", ", unknown.OrderBy(w => w, StringComparer.Ordinal).Take(5));
                issues.Add(CategoryHelpers.Issue(
                    $"Possible spelling issues ({sample}).",
                    row.Url,
                    "Low",
                    "Review title, H1, and visible copy for typos."));
            }
        }

        return (issues.Take(20).ToList(), null);
    }

    internal static async Task<(List<CategoryIssue> Issues, bool UsedParser)> HtmlValidationIssuesAsync(
        IReadOnlyList<CrawlRow> rows,
        long? crawlRunId,
        CrawlPageHtmlReader? htmlReader,
        CancellationToken cancellationToken,
        int maxPages = 30)
    {
        var issues = new List<CategoryIssue>();
        var checkedCount = 0;

        if (htmlReader is not null && crawlRunId is > 0)
        {
            var htmlRows = await htmlReader.ReadBatchAsync(crawlRunId.Value, maxPages, cancellationToken);
            foreach (var (url, html) in htmlRows)
            {
                if (checkedCount >= maxPages)
                {
                    break;
                }

                checkedCount++;
                var warnings = CollectHtmlWarnings(html);
                if (warnings.Count > 0)
                {
                    issues.Add(CategoryHelpers.Issue(
                        $"HTML structure warnings: {string.Join(", ", warnings)}.",
                        url,
                        "Low",
                        "Fix markup validation issues that may affect parsing or accessibility."));
                }
            }

            return (issues, false);
        }

        foreach (var row in rows)
        {
            if (checkedCount >= maxPages)
            {
                break;
            }

            checkedCount++;
            var warnings = CollectHtmlWarningsFromMetadata(row);
            if (warnings.Count == 0)
            {
                continue;
            }

            issues.Add(CategoryHelpers.Issue(
                $"HTML structure warnings: {string.Join(", ", warnings)}.",
                row.Url,
                "Low",
                "Fix markup validation issues that may affect parsing or accessibility."));
        }

        return (issues, false);
    }

    internal static List<CategoryIssue> AmpAuditIssues(IReadOnlyList<CrawlRow> rows)
    {
        var issues = new List<CategoryIssue>();
        foreach (var row in rows)
        {
            var url = row.Url ?? "";
            var (_, _, amphtml) = ParsePagination(row.PageAnalysisJson);
            var path = Uri.TryCreate(url, UriKind.Absolute, out var uri) ? uri.AbsolutePath.ToLowerInvariant() : "";
            var isAmp = path.Contains("/amp", StringComparison.Ordinal)
                || Regex.IsMatch(row.ContentType ?? "", @"\bamp\b", RegexOptions.IgnoreCase);

            if (string.IsNullOrWhiteSpace(amphtml) && !isAmp)
            {
                continue;
            }

            var canon = row.CanonicalUrl?.Trim() ?? "";
            if (string.IsNullOrEmpty(canon))
            {
                issues.Add(CategoryHelpers.Issue(
                    "AMP or amphtml variant missing canonical URL.",
                    url,
                    "Medium",
                    "Add canonical link pointing to the preferred non-AMP URL."));
            }
            else if (!string.IsNullOrWhiteSpace(amphtml)
                     && isAmp
                     && !string.Equals(amphtml.Trim(), canon, StringComparison.OrdinalIgnoreCase))
            {
                issues.Add(CategoryHelpers.Issue(
                    "AMP page canonical does not match linked amphtml href.",
                    url,
                    "Medium",
                    "Align canonical URL with amphtml pairing for AMP variants."));
            }
        }

        return issues.Take(25).ToList();
    }

    internal static async Task<List<CategoryIssue>> WaybackIssuesAsync(
        IReadOnlyList<CrawlRow> rows,
        IHttpClientFactory? httpClientFactory,
        CancellationToken cancellationToken,
        int maxLookups = 15,
        ILogger? logger = null)
    {
        var issues = new List<CategoryIssue>();
        if (httpClientFactory is null)
        {
            return issues;
        }

        var cache = new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase);
        var looked = 0;
        var client = httpClientFactory.CreateClient(nameof(OptionalAuditsBuilder));
        client.Timeout = TimeSpan.FromSeconds(10);

        foreach (var row in rows)
        {
            if (looked >= maxLookups)
            {
                break;
            }

            var status = row.Status?.Trim() ?? "";
            if (!status.StartsWith("404", StringComparison.Ordinal))
            {
                continue;
            }

            var url = row.Url?.Trim() ?? "";
            if (url.Length == 0)
            {
                continue;
            }

            var cacheKey = url;
            if (cache.TryGetValue(cacheKey, out var cachedAvailable))
            {
                if (cachedAvailable)
                {
                    issues.Add(CategoryHelpers.Issue(
                        "404 URL has Wayback snapshot (Estimated).",
                        url,
                        "Low",
                        "Review whether redirect or content restoration is appropriate."));
                    looked++;
                }

                continue;
            }

            looked++;
            try
            {
                using var response = await client.GetAsync(
                    $"https://archive.org/wayback/available?url={Uri.EscapeDataString(url)}",
                    cancellationToken);
                if (!response.IsSuccessStatusCode)
                {
                    cache[cacheKey] = false;
                    continue;
                }

                await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
                using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
                var available = false;
                string? timestamp = null;
                if (doc.RootElement.TryGetProperty("archived_snapshots", out var snapshots)
                    && snapshots.TryGetProperty("closest", out var closest))
                {
                    available = closest.TryGetProperty("available", out var availEl)
                                && availEl.ValueKind == JsonValueKind.True;
                    if (closest.TryGetProperty("timestamp", out var tsEl))
                    {
                        timestamp = tsEl.GetString();
                    }
                }

                cache[cacheKey] = available;
                if (available)
                {
                    issues.Add(CategoryHelpers.Issue(
                        $"404 URL has Wayback snapshot (Estimated, captured {timestamp ?? "unknown"}).",
                        url,
                        "Low",
                        "Review whether redirect or content restoration is appropriate."));
                }
            }
            catch (Exception ex)
            {
                logger?.LogDebug(ex, "Wayback lookup failed for {Url}", url);
                cache[cacheKey] = false;
            }
        }

        return issues;
    }

    internal static List<CategoryIssue> AxeIssuesFromRows(IReadOnlyList<CrawlRow> rows)
    {
        var issues = new List<CategoryIssue>();
        foreach (var row in rows)
        {
            var pa = CategoryHelpers.ParsePageAnalysisCell(row.PageAnalysisJson);
            if (!pa.TryGetValue("axe_violations", out var axeRaw))
            {
                continue;
            }

            var axeJson = axeRaw?.ToString();
            if (string.IsNullOrWhiteSpace(axeJson))
            {
                continue;
            }

            try
            {
                using var doc = JsonDocument.Parse(axeJson);
                if (doc.RootElement.ValueKind != JsonValueKind.Array)
                {
                    continue;
                }

                var count = 0;
                foreach (var v in doc.RootElement.EnumerateArray())
                {
                    if (count >= 5)
                    {
                        break;
                    }

                    if (v.ValueKind != JsonValueKind.Object)
                    {
                        continue;
                    }

                    var msg = v.TryGetProperty("description", out var desc) ? desc.GetString()
                        : v.TryGetProperty("id", out var idEl) ? idEl.GetString() : "axe violation";
                    var rec = v.TryGetProperty("help", out var help) ? help.GetString()
                        : "Fix accessibility violation reported by axe-core.";
                    issues.Add(CategoryHelpers.Issue(
                        $"axe: {msg}",
                        row.Url,
                        "Medium",
                        rec ?? "Fix accessibility violation reported by axe-core."));
                    count++;
                }
            }
            catch (JsonException)
            {
                // ignore malformed payload
            }
        }

        return issues.Take(40).ToList();
    }

    private static (string? RelNext, string? RelPrev, string? Amphtml) ParsePagination(string? pageAnalysisJson)
    {
        var pa = CategoryHelpers.ParsePageAnalysisCell(pageAnalysisJson);
        if (!pa.TryGetValue("pagination", out var pagRaw) || pagRaw is not string pagJson)
        {
            return (null, null, null);
        }

        try
        {
            using var doc = JsonDocument.Parse(pagJson);
            if (doc.RootElement.ValueKind != JsonValueKind.Object)
            {
                return (null, null, null);
            }

            string? GetStr(string name) =>
                doc.RootElement.TryGetProperty(name, out var el) && el.ValueKind == JsonValueKind.String
                    ? el.GetString()
                    : null;

            return (GetStr("rel_next"), GetStr("rel_prev"), GetStr("amphtml"));
        }
        catch (JsonException)
        {
            return (null, null, null);
        }
    }

    private static string SpellTextParts(CrawlRow row) =>
        string.Join(' ', new[]
        {
            row.Title ?? "",
            row.H1 ?? "",
            row.ContentExcerpt ?? "",
            row.MetaDescription ?? "",
        }.Where(p => !string.IsNullOrWhiteSpace(p)));

    private static List<string> CollectHtmlWarnings(string html)
    {
        var warnings = new List<string>();
        if (TitleTagRegex.Matches(html).Count > 1)
        {
            warnings.Add("multiple title tags");
        }

        if (HtmlOpenRegex.IsMatch(html) && !HtmlCloseRegex.IsMatch(html))
        {
            warnings.Add("missing closing html tag");
        }

        var ids = IdAttrRegex.Matches(html).Select(m => m.Groups[1].Value).ToList();
        if (ids.Count != ids.Distinct(StringComparer.OrdinalIgnoreCase).Count())
        {
            warnings.Add("duplicate id attributes");
        }

        return warnings;
    }

    private static List<string> CollectHtmlWarningsFromMetadata(CrawlRow row)
    {
        // Without stored HTML, only flag obvious metadata gaps.
        var warnings = new List<string>();
        if (row.H1Count is > 1)
        {
            warnings.Add("multiple h1 tags");
        }

        return warnings;
    }

    private static bool ParseBool(IReadOnlyDictionary<string, string> config, string key, bool defaultValue)
    {
        if (!config.TryGetValue(key, out var raw))
        {
            return defaultValue;
        }

        return raw.Trim().ToLowerInvariant() switch
        {
            "0" or "false" or "no" or "off" => false,
            "1" or "true" or "yes" or "on" => true,
            _ => defaultValue,
        };
    }
}
