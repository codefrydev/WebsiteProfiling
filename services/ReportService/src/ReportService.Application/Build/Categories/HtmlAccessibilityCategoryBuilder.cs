using System.Text.Json;
using System.Text.Json.Nodes;
using ReportService.Application.Repositories;

namespace ReportService.Application.Build.Categories;

public static class HtmlAccessibilityCategoryBuilder
{
    public static ReportCategory Build(
        IReadOnlyList<CrawlRow> rows,
        IReadOnlyDictionary<string, JsonNode>? lighthouseByUrl = null,
        IReadOnlyDictionary<string, object?>? lighthouseSummary = null)
    {
        var success = CategoryHelpers.SuccessRows(rows);
        if (success.Count == 0)
        {
            return new ReportCategory("html_accessibility", "Accessibility", 0, [], []);
        }

        var issues = new List<CategoryIssue>();
        var deductions = new List<(int, bool)>();

        if (success.Any(r => r.H1Count.HasValue))
        {
            var zeroH1 = success.Count(r => r.H1Count == 0);
            var multiH1 = success.Count(r => r.H1Count is > 1);
            if (zeroH1 > 0)
            {
                issues.Add(CategoryHelpers.Issue(
                    $"{zeroH1} page(s) missing H1.",
                    priority: "High",
                    recommendation: "Add exactly one H1 per page describing the main content."));
                deductions.Add((Math.Min(20, zeroH1 * 3), true));
            }

            if (multiH1 > 0)
            {
                issues.Add(CategoryHelpers.Issue(
                    $"{multiH1} page(s) have multiple H1s.",
                    priority: "Medium",
                    recommendation: "Use a single H1 per page; use H2–H6 for subsections."));
                deductions.Add((Math.Min(10, multiH1 * 2), true));
            }
        }

        if (success.Any(r => !string.IsNullOrWhiteSpace(r.HeadingSequence)))
        {
            var pagesWithSkippedHeading = 0;
            foreach (var row in success)
            {
                if (HasSkippedHeadingLevel(row.HeadingSequence))
                {
                    if (pagesWithSkippedHeading == 0)
                    {
                        issues.Add(CategoryHelpers.Issue(
                            "Skipped heading level (e.g. H1 then H3).",
                            row.Url,
                            "Medium",
                            "Use heading levels in order (H1, H2, H3) without skipping."));
                    }

                    pagesWithSkippedHeading++;
                    break;
                }
            }

            if (pagesWithSkippedHeading > 0)
            {
                deductions.Add((Math.Min(15, pagesWithSkippedHeading * 5), true));
            }
        }

        if (success.Any(r => r.ImagesTotal.HasValue && r.ImagesWithoutAlt.HasValue))
        {
            var total = success.Sum(r => r.ImagesTotal ?? 0);
            var missingAlt = success.Sum(r => r.ImagesWithoutAlt ?? 0);
            if (total > 0 && missingAlt > 0)
            {
                issues.Add(CategoryHelpers.Issue(
                    $"{missingAlt} image(s) without alt (or aria-label).",
                    priority: "High",
                    recommendation: "Add meaningful alt text to all images; use alt='' for decorative images."));
                deductions.Add((Math.Min(15, missingAlt * 2), true));
            }
        }

        if (success.Any(r => r.WordCount.HasValue))
        {
            var veryThin = success.Count(r => r.WordCount is > 0 and < 100);
            if (veryThin > 0)
            {
                issues.Add(CategoryHelpers.Issue(
                    $"{veryThin} page(s) with very thin content (under 100 words).",
                    priority: "High",
                    recommendation: "Expand thin pages with meaningful content (aim for 300+ words)."));
                deductions.Add((Math.Min(15, veryThin * 3), true));
            }
        }

        if (success.Any(r => r.ReadingLevel.HasValue))
        {
            var complexPages = success.Count(r => r.ReadingLevel is > 14);
            if (complexPages > 0)
            {
                issues.Add(CategoryHelpers.Issue(
                    $"{complexPages} page(s) have very complex content (reading level > 14).",
                    priority: "Medium",
                    recommendation: "Simplify language for broader audience accessibility (aim for grade 8-10)."));
                deductions.Add((Math.Min(10, complexPages * 2), true));
            }
        }

        var contrastIssues = ContrastIssuesFromSources(rows, lighthouseByUrl);
        var lhA11y = LighthouseAccessibilityIssuesFromSummary(lighthouseSummary);
        if (lhA11y.Count > 0)
        {
            contrastIssues.AddRange(lhA11y);
        }

        if (contrastIssues.Count > 0)
        {
            issues.AddRange(contrastIssues.Take(40));
            deductions.Add((Math.Min(25, contrastIssues.Count * 4), true));
        }
        else
        {
            issues.Add(CategoryHelpers.Issue(
                "Color contrast is not measured by this tool.",
                priority: "Low",
                recommendation: "Enable axe (browser crawl) or Lighthouse to check contrast."));
        }

        var score = CategoryHelpers.ScoreDeductions(100, deductions);
        if (success.Count > 0 && score == 0)
        {
            score = 5;
        }

        score = Math.Min(100, Math.Max(0, score));
        var sorted = CategoryHelpers.SortIssues(issues);
        return new ReportCategory(
            "html_accessibility",
            "Accessibility",
            score,
            sorted,
            CategoryHelpers.RecommendationsFromIssues(sorted));
    }

    private static bool HasSkippedHeadingLevel(string? sequence)
    {
        if (string.IsNullOrWhiteSpace(sequence))
        {
            return false;
        }

        var levels = sequence.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(h => h.Length == 2 && h[0] == 'h' && "123456".Contains(h[1]))
            .Select(h => h[1] - '0')
            .ToList();
        for (var i = 1; i < levels.Count; i++)
        {
            if (levels[i] > levels[i - 1] + 1)
            {
                return true;
            }
        }

        return false;
    }

    private static List<CategoryIssue> ContrastIssuesFromSources(
        IReadOnlyList<CrawlRow> rows,
        IReadOnlyDictionary<string, JsonNode>? lighthouseByUrl)
    {
        var issues = new List<CategoryIssue>();
        var skipLhContrast = new HashSet<string>(StringComparer.Ordinal);

        foreach (var row in rows)
        {
            var url = row.Url.Trim();
            if (string.IsNullOrEmpty(url))
            {
                continue;
            }

            var pa = CategoryHelpers.ParsePageAnalysisCell(row.PageAnalysisJson);
            if (!pa.TryGetValue("axe_violations", out var axeObj))
            {
                continue;
            }

            var axeRaw = axeObj?.ToString();
            if (string.IsNullOrWhiteSpace(axeRaw))
            {
                continue;
            }

            try
            {
                using var doc = JsonDocument.Parse(axeRaw);
                if (doc.RootElement.ValueKind != JsonValueKind.Array)
                {
                    continue;
                }

                foreach (var v in doc.RootElement.EnumerateArray())
                {
                    if (v.ValueKind != JsonValueKind.Object)
                    {
                        continue;
                    }

                    var id = v.TryGetProperty("id", out var idEl) ? idEl.GetString() ?? "" : "";
                    if (!id.Contains("color-contrast", StringComparison.Ordinal))
                    {
                        continue;
                    }

                    skipLhContrast.Add(url.Trim().TrimEnd('/'));
                    var msg = v.TryGetProperty("description", out var desc) ? desc.GetString()
                        : v.TryGetProperty("help", out var help) ? help.GetString() : "Color contrast violation";
                    var rec = v.TryGetProperty("help", out var helpRec) ? helpRec.GetString()
                        : "Fix text/background contrast to meet WCAG AA (axe-core).";
                    issues.Add(CategoryHelpers.Issue(
                        $"axe: {msg}",
                        url,
                        "Medium",
                        rec ?? "Fix text/background contrast to meet WCAG AA (axe-core)."));
                    break;
                }
            }
            catch (JsonException)
            {
                // ignore malformed axe payload
            }
        }

        issues.AddRange(LighthouseAccessibilityIssuesFromSources(lighthouseByUrl, skipLhContrast));
        return issues;
    }

    private static List<CategoryIssue> LighthouseAccessibilityIssuesFromSources(
        IReadOnlyDictionary<string, JsonNode>? lighthouseByUrl,
        HashSet<string> skipContrastUrls)
    {
        var issues = new List<CategoryIssue>();
        if (lighthouseByUrl is null)
        {
            return issues;
        }

        var seen = new HashSet<(string Url, string AuditId)>();
        foreach (var (url, summaryNode) in lighthouseByUrl)
        {
            if (summaryNode is not JsonObject summary)
            {
                continue;
            }

            var u = (url ?? summary["url"]?.GetValue<string>() ?? "").Trim().TrimEnd('/');
            if (string.IsNullOrEmpty(u))
            {
                continue;
            }

            if (summary["top_failures"] is not JsonArray failures)
            {
                continue;
            }

            foreach (var failNode in failures)
            {
                if (failNode is not JsonObject fail)
                {
                    continue;
                }

                var aid = fail["id"]?.GetValue<string>()?.Trim() ?? "";
                if (string.IsNullOrEmpty(aid))
                {
                    continue;
                }

                if (aid == "color-contrast" && skipContrastUrls.Contains(u))
                {
                    continue;
                }

                if (!IsAccessibilityFailure(fail))
                {
                    continue;
                }

                var key = (u, aid);
                if (!seen.Add(key))
                {
                    continue;
                }

                var msg = fail["title"]?.GetValue<string>() ?? aid.Replace('-', ' ');
                issues.Add(CategoryHelpers.Issue(
                    $"Lighthouse: {msg}",
                    u,
                    "Medium",
                    "See Lighthouse accessibility recommendations for this page."));
            }
        }

        return issues;
    }

    private static List<CategoryIssue> LighthouseAccessibilityIssuesFromSummary(
        IReadOnlyDictionary<string, object?>? lighthouseSummary)
    {
        var issues = new List<CategoryIssue>();
        if (lighthouseSummary is null
            || !lighthouseSummary.TryGetValue("top_failures", out var failuresObj)
            || failuresObj is not JsonElement failures
            || failures.ValueKind != JsonValueKind.Array)
        {
            return issues;
        }

        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var fail in failures.EnumerateArray())
        {
            if (fail.ValueKind != JsonValueKind.Object)
            {
                continue;
            }

            var aid = fail.TryGetProperty("id", out var idEl) ? idEl.GetString()?.Trim() ?? "" : "";
            if (string.IsNullOrEmpty(aid) || !seen.Add(aid))
            {
                continue;
            }

            if (!IsAccessibilityFailure(fail))
            {
                continue;
            }

            var msg = fail.TryGetProperty("title", out var titleEl) ? titleEl.GetString() ?? aid.Replace('-', ' ')
                : aid.Replace('-', ' ');
            issues.Add(CategoryHelpers.Issue(
                $"Lighthouse: {msg}",
                priority: "Medium",
                recommendation: "See Lighthouse accessibility recommendations."));
        }

        return issues;
    }

    private static bool IsAccessibilityFailure(JsonObject fail)
    {
        var category = fail["category"]?.GetValue<string>() ?? fail["category_id"]?.GetValue<string>() ?? "";
        if (string.Equals(category, "accessibility", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (!string.IsNullOrWhiteSpace(category))
        {
            return false;
        }

        var impact = fail["impact"]?.GetValue<string>() ?? "";
        return string.Equals(impact, "Accessibility", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsAccessibilityFailure(JsonElement fail)
    {
        var category = fail.TryGetProperty("category", out var catEl) ? catEl.GetString()
            : fail.TryGetProperty("category_id", out var catIdEl) ? catIdEl.GetString() : "";
        if (string.Equals(category, "accessibility", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (!string.IsNullOrWhiteSpace(category))
        {
            return false;
        }

        var impact = fail.TryGetProperty("impact", out var impactEl) ? impactEl.GetString() : "";
        return string.Equals(impact, "Accessibility", StringComparison.OrdinalIgnoreCase);
    }
}
