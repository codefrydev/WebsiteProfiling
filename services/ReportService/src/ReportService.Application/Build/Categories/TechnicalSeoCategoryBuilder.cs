using System.Text.Json;
using ReportService.Application.Build;
using ReportService.Application.Repositories;

namespace ReportService.Application.Build.Categories;

public static class TechnicalSeoCategoryBuilder
{
    public static ReportCategory Build(
        IReadOnlyList<CrawlRow> rows,
        IReadOnlyDictionary<string, object?>? siteLevel)
    {
        var success = CategoryHelpers.SuccessRows(rows);
        var issues = new List<CategoryIssue>();
        var deductions = new List<(int, bool)>();
        siteLevel ??= new Dictionary<string, object?>();

        if (GetBool(siteLevel, "robots_present", defaultValue: true) == false)
        {
            issues.Add(CategoryHelpers.Issue(
                "robots.txt is missing or unreachable.",
                priority: "High",
                recommendation: "Add a robots.txt at the site root to control crawler access."));
            deductions.Add((15, true));
        }

        if (GetBool(siteLevel, "sitemap_present", defaultValue: true) == false)
        {
            issues.Add(CategoryHelpers.Issue(
                "sitemap.xml (or sitemap index) is missing or unreachable.",
                priority: "High",
                recommendation: "Add a sitemap at /sitemap.xml or link it in robots.txt."));
            deductions.Add((10, true));
        }

        if (GetBool(siteLevel, "sitemap_present") == true
            && GetBool(siteLevel, "sitemap_valid", defaultValue: true) == false)
        {
            issues.Add(CategoryHelpers.Issue(
                "sitemap.xml could not be parsed as valid XML.",
                priority: "Medium",
                recommendation: "Ensure sitemap is valid XML and follows sitemaps.org format."));
            deductions.Add((5, true));
        }

        if (GetBool(siteLevel, "enable_ads_txt_check") == true
            && GetBool(siteLevel, "ads_txt_present") == false)
        {
            issues.Add(CategoryHelpers.Issue(
                "ads.txt is missing or unreachable.",
                priority: "Low",
                recommendation: "Add an ads.txt file at the site root if you run programmatic advertising."));
        }

        if (GetBool(siteLevel, "enable_security_txt_check") == true
            && GetBool(siteLevel, "security_txt_present") == false)
        {
            issues.Add(CategoryHelpers.Issue(
                "security.txt is missing or unreachable.",
                priority: "Low",
                recommendation: "Publish security.txt at /.well-known/security.txt with a Contact field for security reporting."));
        }

        if (success.Count > 0)
        {
            var noindexCount = success.Count(r => r.Noindex == true);
            if (noindexCount > 0)
            {
                issues.Add(CategoryHelpers.Issue(
                    $"{noindexCount} page(s) have noindex.",
                    priority: noindexCount > 5 ? "High" : "Medium",
                    recommendation: "Remove noindex from pages that should be indexed, or keep for intentional no-index pages."));
                deductions.Add((Math.Min(15, noindexCount * 3), true));
            }

            if (rows.Any(r => r.CanonicalUrl is not null))
            {
                var missingCanonIssues = 0;
                foreach (var row in success)
                {
                    var canonical = row.CanonicalUrl?.Trim();
                    if (!string.IsNullOrEmpty(canonical))
                    {
                        continue;
                    }

                    if (missingCanonIssues >= CategoryHelpers.MaxIssuesPerCheck)
                    {
                        break;
                    }

                    issues.Add(CategoryHelpers.Issue(
                        "Missing canonical URL.",
                        row.Url,
                        "Medium",
                        "Add a canonical link tag pointing to the preferred URL."));
                    missingCanonIssues++;
                }

                var missingCanon = success.Count(r => string.IsNullOrWhiteSpace(r.CanonicalUrl));
                if (missingCanon > 0)
                {
                    deductions.Add((Math.Min(15, missingCanon * 2), true));
                }

                var crossCanonIssues = 0;
                var crossCanonCount = 0;
                foreach (var row in success)
                {
                    var canonical = row.CanonicalUrl?.Trim();
                    if (string.IsNullOrEmpty(canonical))
                    {
                        continue;
                    }

                    var pageUrl = row.Url.Trim();
                    var canon = canonical.Trim();
                    if (string.Equals(pageUrl, canon, StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    crossCanonCount++;
                    if (crossCanonIssues >= CategoryHelpers.MaxIssuesPerCheck)
                    {
                        continue;
                    }

                    issues.Add(CategoryHelpers.Issue(
                        $"Canonical points to different URL: {canon}",
                        row.Url,
                        "High",
                        "Set canonical to this page URL or the preferred duplicate."));
                    crossCanonIssues++;
                }

                if (crossCanonCount > 0)
                {
                    deductions.Add((Math.Min(10, crossCanonCount * 2), true));
                }
            }

            if (success.Count > 1 && success.Any(r => r.Title is not null || r.MetaDescription is not null))
            {
                var groups = success
                    .GroupBy(r => $"{r.Title ?? ""}|{r.MetaDescription ?? ""}", StringComparer.Ordinal)
                    .Where(g => g.Count() > 1)
                    .ToList();
                if (groups.Count > 0)
                {
                    issues.Add(CategoryHelpers.Issue(
                        $"Possible duplicate content: {groups.Count} group(s) of pages share same title and meta description.",
                        priority: "Medium",
                        recommendation: "Differentiate titles and meta descriptions, or use canonicals to designate the preferred URL."));
                    deductions.Add((10, true));
                }
            }

            if (rows.Any(r => r.OgTitle is not null))
            {
                var ogPresent = success.Count(r => !string.IsNullOrWhiteSpace(r.OgTitle));
                var ogPct = (double)ogPresent / success.Count;
                if (ogPct < 0.5)
                {
                    issues.Add(CategoryHelpers.Issue(
                        $"Open Graph tags missing on {(int)((1 - ogPct) * 100)}% of pages.",
                        priority: "Medium",
                        recommendation: "Add og:title, og:description, and og:image meta tags for social sharing."));
                    deductions.Add((5, true));
                }
            }

            if (rows.Any(r => r.TwitterCard is not null))
            {
                var twPresent = success.Count(r => !string.IsNullOrWhiteSpace(r.TwitterCard));
                var twPct = (double)twPresent / success.Count;
                if (twPct < 0.2)
                {
                    issues.Add(CategoryHelpers.Issue(
                        $"Twitter Card tags missing on {(int)((1 - twPct) * 100)}% of pages.",
                        priority: "Low",
                        recommendation: "Add twitter:card meta tags for better Twitter/X sharing previews."));
                    deductions.Add((3, true));
                }
            }

            if (success.Any(r => r.HasSchema.HasValue))
            {
                var withSchema = success.Count(r => r.HasSchema == true);
                if (withSchema == 0)
                {
                    issues.Add(CategoryHelpers.Issue(
                        "No structured data (JSON-LD or microdata) detected.",
                        priority: "Low",
                        recommendation: "Add schema.org markup (e.g. Organization, Article) for rich results."));
                    deductions.Add((5, true));
                }
            }

            var missingLang = 0;
            foreach (var row in success)
            {
                if (string.IsNullOrWhiteSpace(ResolveHtmlLang(row)))
                {
                    missingLang++;
                }
            }

            if (missingLang > 0 && success.Count >= 3)
            {
                var ratio = (double)missingLang / success.Count;
                if (ratio > 0.1)
                {
                    issues.Add(CategoryHelpers.Issue(
                        $"{missingLang} page(s) missing <html lang> (of {success.Count} OK responses).",
                        priority: ratio > 0.5 ? "Medium" : "Low",
                        recommendation: "Add <html lang=\"...\"> matching the primary language of each page."));
                    deductions.Add((Math.Min(10, Math.Max(2, missingLang / 5)), true));
                }
            }

            issues.AddRange(CategoryHelpers.HreflangIssues(success));
            issues.AddRange(CategoryHelpers.SchemaIssues(success));
            issues.AddRange(CategoryHelpers.Soft404Issues(success));

            var pagesWithConsole = 0;
            foreach (var row in success)
            {
                var pa = CategoryHelpers.ParsePageAnalysisCell(row.PageAnalysisJson);
                var counts = BrowserDiagnosticsHelper.SummaryFromPageAnalysis(pa);
                if (counts.PageErrorCount > 0)
                {
                    issues.Add(CategoryHelpers.Issue(
                        "Uncaught JavaScript error during browser render.",
                        row.Url,
                        "High",
                        "Fix runtime JS errors that may break page functionality or SEO signals."));
                    deductions.Add((5, true));
                }

                if (counts.ConsoleErrorCount > 0)
                {
                    pagesWithConsole++;
                }
            }

            if (pagesWithConsole > 0)
            {
                issues.Add(CategoryHelpers.Issue(
                    $"{pagesWithConsole} page(s) logged console errors during JavaScript rendering.",
                    priority: pagesWithConsole > 3 ? "High" : "Medium",
                    recommendation: "Inspect browser console errors on affected URLs; fix broken scripts or API calls."));
                deductions.Add((Math.Min(15, pagesWithConsole * 2), true));
            }
        }

        var sorted = CategoryHelpers.SortIssues(issues);
        return new ReportCategory(
            "technical_seo",
            "Technical SEO",
            CategoryHelpers.ScoreDeductions(100, deductions),
            sorted,
            CategoryHelpers.RecommendationsFromIssues(sorted));
    }

    private static bool? GetBool(IReadOnlyDictionary<string, object?> dict, string key, bool? defaultValue = null)
    {
        if (!dict.TryGetValue(key, out var val) || val is null)
        {
            return defaultValue;
        }

        return val switch
        {
            bool b => b,
            JsonElement { ValueKind: JsonValueKind.True } => true,
            JsonElement { ValueKind: JsonValueKind.False } => false,
            string s when bool.TryParse(s, out var b) => b,
            _ => defaultValue,
        };
    }

    private static string? ResolveHtmlLang(CrawlRow row)
    {
        if (!string.IsNullOrWhiteSpace(row.HtmlLang))
        {
            return row.HtmlLang.Trim();
        }

        var pa = CategoryHelpers.ParsePageAnalysisCell(row.PageAnalysisJson);
        if (pa.TryGetValue("html_lang", out var lang) && lang is not null)
        {
            return lang.ToString()?.Trim();
        }

        return null;
    }
}
