using ReportService.Application.Repositories;

namespace ReportService.Application.Build.Categories;

public static class PerformanceCategoryBuilder
{
    public static ReportCategory Build(IReadOnlyList<CrawlRow> rows)
    {
        var success = CategoryHelpers.SuccessRows(rows);
        if (success.Count == 0)
        {
            return new ReportCategory("performance", "Performance", 0, [], []);
        }

        var issues = new List<CategoryIssue>();
        var deductions = new List<(int, bool)>();

        if (success.Any(r => r.ResponseTimeMs.HasValue))
        {
            var slow = success.Count(r => r.ResponseTimeMs is > CategoryHelpers.ResponseTimeSlowMs);
            if (slow > 0)
            {
                issues.Add(CategoryHelpers.Issue(
                    $"{slow} page(s) have server response time > {CategoryHelpers.ResponseTimeSlowMs / 1000}s.",
                    priority: slow > 5 ? "High" : "Medium",
                    recommendation: "Optimize server response time (TTFB): caching, CDN, or backend tuning."));
                deductions.Add((Math.Min(20, slow * 2), true));
            }
        }

        var sorted = CategoryHelpers.SortIssues(issues);
        return new ReportCategory(
            "performance",
            "Performance",
            CategoryHelpers.ScoreDeductions(100, deductions),
            sorted,
            CategoryHelpers.RecommendationsFromIssues(sorted));
    }
}
