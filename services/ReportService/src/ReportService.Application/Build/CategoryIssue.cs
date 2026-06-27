namespace ReportService.Application.Build;

public sealed record CategoryIssue(
    string Message,
    string Url = "",
    string Priority = "Medium",
    string Recommendation = "",
    double GscClicks = 0,
    double GscImpressions = 0,
    double Ga4Sessions = 0,
    double? ImpactScore = null,
    string FindingType = "");

public sealed record ReportCategory(
    string Id,
    string Name,
    int? Score,
    IReadOnlyList<CategoryIssue> Issues,
    IReadOnlyList<string> Recommendations);
