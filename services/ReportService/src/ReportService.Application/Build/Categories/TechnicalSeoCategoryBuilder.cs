using System.Text.Json;
using ReportService.Application.Repositories;

namespace ReportService.Application.Build.Categories;

public static class TechnicalSeoCategoryBuilder
{
    public static ReportCategory Build(
        IReadOnlyList<CrawlRow> rows,
        IReadOnlyDictionary<string, object?>? siteLevel)
    {
        var success = CategoryHelpers.SuccessRows(rows);
        if (success.Count == 0)
        {
            return new ReportCategory("technical_seo", "Technical SEO", 0, [], []);
        }

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

        if (GetBool(siteLevel, "ads_txt_present") == false)
        {
            issues.Add(CategoryHelpers.Issue(
                "ads.txt is missing or unreachable.",
                priority: "Low",
                recommendation: "Add an ads.txt file at the site root if you run programmatic advertising."));
        }

        if (GetBool(siteLevel, "security_txt_present") == false)
        {
            issues.Add(CategoryHelpers.Issue(
                "security.txt is missing or unreachable.",
                priority: "Low",
                recommendation: "Publish security.txt at /.well-known/security.txt with a Contact field for security reporting."));
        }

        var noindexCount = success.Count(r => r.Noindex == true);
        if (noindexCount > 0)
        {
            issues.Add(CategoryHelpers.Issue(
                $"{noindexCount} page(s) have noindex.",
                priority: noindexCount > 5 ? "High" : "Medium",
                recommendation: "Remove noindex from pages that should be indexed, or keep for intentional no-index pages."));
            deductions.Add((Math.Min(15, noindexCount * 3), true));
        }

        foreach (var row in success)
        {
            var canonical = row.CanonicalUrl?.Trim();
            if (string.IsNullOrEmpty(canonical))
            {
                continue;
            }

            var pageUrl = row.Url.Trim().TrimEnd('/');
            var canon = canonical.TrimEnd('/');
            if (!string.Equals(pageUrl, canon, StringComparison.OrdinalIgnoreCase))
            {
                issues.Add(CategoryHelpers.Issue(
                    $"Canonical points to different URL: {canon}",
                    row.Url,
                    "High",
                    "Set canonical to this page URL or the preferred duplicate."));
                deductions.Add((10, true));
                break;
            }
        }

        issues.AddRange(CategoryHelpers.HreflangIssues(success));
        issues.AddRange(CategoryHelpers.SchemaIssues(success));
        issues.AddRange(CategoryHelpers.Soft404Issues(success));

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
}
