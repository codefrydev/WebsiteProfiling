namespace ReportService.Application.Build;

public static class CategoryPayloadSerializer
{
    public static List<Dictionary<string, object?>> ToPayload(IReadOnlyList<ReportCategory> categories) =>
        categories.Select(ToDictionary).ToList();

    public static Dictionary<string, object?> ToDictionary(ReportCategory category) =>
        new()
        {
            ["id"] = category.Id,
            ["name"] = category.Name,
            ["score"] = category.Score,
            ["issues"] = category.Issues.Select(i =>
            {
                var issue = new Dictionary<string, object?>
                {
                    ["message"] = i.Message,
                    ["url"] = i.Url,
                    ["priority"] = i.Priority,
                    ["recommendation"] = i.Recommendation,
                };
                if (i.ImpactScore is not null || i.GscClicks > 0 || i.GscImpressions > 0 || i.Ga4Sessions > 0)
                {
                    issue["gsc_clicks"] = i.GscClicks;
                    issue["gsc_impressions"] = i.GscImpressions;
                    issue["ga4_sessions"] = i.Ga4Sessions;
                    issue["impact_score"] = i.ImpactScore
                        ?? IssueImpactEnricher.ComputeImpactScore(i.Priority, i.GscClicks, i.Ga4Sessions);
                }

                return issue;
            }).ToList(),
            ["recommendations"] = category.Recommendations,
        };
}
