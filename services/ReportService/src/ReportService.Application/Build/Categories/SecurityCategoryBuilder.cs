using ReportService.Application.Repositories;

namespace ReportService.Application.Build.Categories;

public static class SecurityCategoryBuilder
{
    public static ReportCategory Build(
        IReadOnlyList<CrawlRow> rows,
        string startUrl)
    {
        var issues = new List<CategoryIssue>();
        var deductions = new List<(int, bool)>();

        if (Uri.TryCreate(startUrl, UriKind.Absolute, out var uri)
            && !string.Equals(uri.Scheme, "https", StringComparison.OrdinalIgnoreCase))
        {
            issues.Add(CategoryHelpers.Issue(
                "Site is not using HTTPS.",
                startUrl,
                "Critical",
                "Serve the site over HTTPS and redirect HTTP to HTTPS."));
            deductions.Add((30, true));
        }

        var sorted = CategoryHelpers.SortIssues(issues);
        return new ReportCategory(
            "security",
            "Security",
            CategoryHelpers.ScoreDeductions(100, deductions),
            sorted,
            CategoryHelpers.RecommendationsFromIssues(sorted));
    }
}
