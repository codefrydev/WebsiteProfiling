using System.Text.RegularExpressions;
using ReportService.Application.Repositories;

namespace ReportService.Application.Build.Categories;

public static class MobileCategoryBuilder
{
    private static readonly Regex ViewportWidthPattern = new(
        "width|device-width",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

    public static ReportCategory Build(IReadOnlyList<CrawlRow> rows)
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

        var sorted = CategoryHelpers.SortIssues(issues);
        return new ReportCategory(
            "mobile",
            "Mobile",
            CategoryHelpers.ScoreDeductions(100, deductions),
            sorted,
            CategoryHelpers.RecommendationsFromIssues(sorted));
    }
}
