using WebsiteProfiling.Contracts.Report;

namespace ReportService.Application.Build;

/// <summary>ReportService adapters over shared <see cref="WebsiteProfiling.Contracts.Report.SiteHealthScoreBuilder"/>.</summary>
public static class SiteHealthScoreBuilder
{
    public static int? Compute(IReadOnlyList<ReportCategory> categories) =>
        WebsiteProfiling.Contracts.Report.SiteHealthScoreBuilder.Compute(
            categories.Select(c => new SiteHealthCategory(c.Id, c.Score)).ToList());

    public static (Dictionary<string, double> CategoryScores, int? SiteHealthScore) ComputeWithCategoryScores(
        IReadOnlyList<ReportCategory> categories) =>
        WebsiteProfiling.Contracts.Report.SiteHealthScoreBuilder.ComputeWithCategoryScores(
            categories.Select(c => new SiteHealthCategory(c.Id, c.Score)).ToList());

    public static (Dictionary<string, double> CategoryScores, int? SiteHealthScore) ComputeWithCategoryScores(
        IEnumerable<IReadOnlyDictionary<string, object?>> payloadCategories) =>
        WebsiteProfiling.Contracts.Report.SiteHealthScoreBuilder.ComputeWithCategoryScores(payloadCategories);
}
