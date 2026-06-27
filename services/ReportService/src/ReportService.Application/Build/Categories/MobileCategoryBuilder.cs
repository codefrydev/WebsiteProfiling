using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using ReportService.Application.Repositories;

namespace ReportService.Application.Build.Categories;

public static class MobileCategoryBuilder
{
    private static readonly Regex ViewportWidthPattern = new(
        "width|device-width",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

    private static readonly string[] LighthouseMobileAudits = ["tap-targets", "font-size"];

    public static ReportCategory Build(
        IReadOnlyList<CrawlRow> rows,
        IReadOnlyDictionary<string, JsonNode>? lighthouseByUrl = null)
    {
        var success = CategoryHelpers.SuccessRows(rows);
        if (success.Count == 0)
        {
            return new ReportCategory("mobile", "Mobile", 0, [], []);
        }

        var issues = new List<CategoryIssue>();
        var deductions = new List<(int, bool)>();

        if (success.Any(r => r.ViewportPresent.HasValue))
        {
            var noViewport = success.Count(r => r.ViewportPresent != true);
            if (noViewport > 0)
            {
                issues.Add(CategoryHelpers.Issue(
                    $"{noViewport} page(s) missing viewport meta tag.",
                    priority: "Critical",
                    recommendation: "Add <meta name='viewport' content='width=device-width, initial-scale=1'>."));
                deductions.Add((Math.Min(25, noViewport * 5), true));
            }

            if (success.Any(r => r.ViewportContent is not null))
            {
                var invalid = success.Count(r =>
                    r.ViewportPresent == true
                    && (string.IsNullOrWhiteSpace(r.ViewportContent)
                        || !ViewportWidthPattern.IsMatch(r.ViewportContent)));
                if (invalid > 0)
                {
                    issues.Add(CategoryHelpers.Issue(
                        "Some pages have viewport without width or device-width.",
                        priority: "High",
                        recommendation: "Use content='width=device-width, initial-scale=1' (or similar)."));
                    deductions.Add((10, true));
                }
            }
        }

        if (lighthouseByUrl is { Count: > 0 })
        {
            foreach (var auditId in LighthouseMobileAudits)
            {
                var failing = new List<string>();
                foreach (var (url, node) in lighthouseByUrl)
                {
                    if (node is not JsonObject lh || !TryGetAuditScore(lh, auditId, out var score) || score >= 0.9)
                    {
                        continue;
                    }

                    failing.Add(url);
                }

                if (failing.Count == 0)
                {
                    continue;
                }

                var label = auditId switch
                {
                    "tap-targets" => "tap targets too small or too close",
                    "font-size" => "text too small to read on mobile",
                    _ => auditId,
                };
                issues.Add(CategoryHelpers.Issue(
                    $"{failing.Count} page(s) failed Lighthouse {auditId} ({label}).",
                    priority: "High",
                    recommendation: auditId == "tap-targets"
                        ? "Ensure tap targets are at least 48×48px with adequate spacing."
                        : "Use a base font size of at least 12px and avoid fixed small text."));
                deductions.Add((Math.Min(15, failing.Count * 3), true));
            }
        }

        var sorted = CategoryHelpers.SortIssues(issues);
        return new ReportCategory(
            "mobile",
            "Mobile",
            CategoryHelpers.ScoreDeductions(100, deductions),
            sorted,
            CategoryHelpers.RecommendationsFromIssues(sorted));
    }

    private static bool TryGetAuditScore(JsonObject lh, string auditId, out double score)
    {
        score = 0;
        if (!lh.TryGetPropertyValue("audits", out var auditsNode) || auditsNode is not JsonArray audits)
        {
            return false;
        }

        foreach (var item in audits)
        {
            if (item is not JsonObject audit)
            {
                continue;
            }

            if (!audit.TryGetPropertyValue("id", out var idNode)
                || idNode is not JsonValue idVal
                || !idVal.TryGetValue(out string? id)
                || !string.Equals(id, auditId, StringComparison.Ordinal))
            {
                continue;
            }

            if (audit.TryGetPropertyValue("score", out var scoreNode)
                && scoreNode is JsonValue scoreVal
                && scoreVal.TryGetValue(out double raw))
            {
                score = raw;
                return true;
            }
        }

        return false;
    }
}
