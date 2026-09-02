using CoreService.Api.Application.Repositories;

namespace CoreService.Api.Application.Build.Categories;

public static class SecurityCategoryBuilder
{
    public static ReportCategory Build(
        IReadOnlyList<CrawlRow> rows,
        string startUrl,
        IReadOnlyList<Dictionary<string, object?>>? securityFindings = null)
    {
        var issues = new List<CategoryIssue>();
        var deductions = new List<(int, bool)>();

        if (Uri.TryCreate(startUrl, UriKind.Absolute, out var parsed)
            && !string.Equals(parsed.Scheme, "https", StringComparison.OrdinalIgnoreCase))
        {
            issues.Add(CategoryHelpers.Issue(
                "Site is not using HTTPS.",
                startUrl,
                "Critical",
                "Serve the site over HTTPS and redirect HTTP to HTTPS."));
            deductions.Add((30, true));
        }

        var httpFinals = rows.Count(r =>
            (r.FinalUrl ?? "").Trim().StartsWith("http://", StringComparison.OrdinalIgnoreCase));
        if (httpFinals > 0)
        {
            issues.Add(CategoryHelpers.Issue(
                $"{httpFinals} URL(s) resolve to HTTP.",
                "",
                "Critical",
                "Ensure all pages redirect to HTTPS."));
            deductions.Add((20, true));
        }

        if (securityFindings is not null)
        {
            foreach (var finding in securityFindings)
            {
                var severity = finding.GetValueOrDefault("severity")?.ToString() ?? "Medium";
                var message = finding.GetValueOrDefault("message")?.ToString() ?? "";
                if (string.IsNullOrWhiteSpace(message))
                {
                    continue;
                }

                issues.Add(CategoryHelpers.Issue(
                    message,
                    finding.GetValueOrDefault("url")?.ToString() ?? "",
                    severity,
                    finding.GetValueOrDefault("recommendation")?.ToString() ?? "",
                    findingType: finding.GetValueOrDefault("finding_type")?.ToString() ?? ""));

                var ded = severity switch
                {
                    "Critical" => 15,
                    "High" => 10,
                    "Medium" => 5,
                    "Low" => 2,
                    _ => 2,
                };
                deductions.Add((Math.Min(ded, 15), true));
            }
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
