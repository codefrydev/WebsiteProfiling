namespace ReportService.Application.Build;

/// <summary>Weighted site health score from fixable audit categories (excludes search_performance, intelligence).</summary>
public static class SiteHealthScoreBuilder
{
    private static readonly Dictionary<string, double> Weights = new(StringComparer.Ordinal)
    {
        ["technical_seo"] = 0.25,
        ["link_health"] = 0.20,
        ["performance"] = 0.15,
        ["security"] = 0.15,
        ["core_web_vitals"] = 0.10,
        ["mobile"] = 0.10,
        ["html_accessibility"] = 0.05,
    };

    private static readonly HashSet<string> Excluded = new(StringComparer.Ordinal)
    {
        "search_performance",
        "intelligence",
    };

    public static int? Compute(IReadOnlyList<ReportCategory> categories)
    {
        var (_, score) = ComputeWithCategoryScores(categories);
        return score;
    }

    public static (Dictionary<string, double> CategoryScores, int? SiteHealthScore) ComputeWithCategoryScores(
        IReadOnlyList<ReportCategory> categories)
    {
        var categoryScores = new Dictionary<string, double>(StringComparer.Ordinal);
        foreach (var cat in categories)
        {
            if (Excluded.Contains(cat.Id) || cat.Score is not int score)
            {
                continue;
            }

            categoryScores[cat.Id] = score;
        }

        double weightedSum = 0;
        double weightTotal = 0;
        foreach (var (id, weight) in Weights)
        {
            if (!categoryScores.TryGetValue(id, out var score))
            {
                continue;
            }

            weightedSum += score * weight;
            weightTotal += weight;
        }

        int? siteHealth = weightTotal > 0
            ? (int)Math.Round(weightedSum / weightTotal)
            : null;

        return (categoryScores, siteHealth);
    }

    public static (Dictionary<string, double> CategoryScores, int? SiteHealthScore) ComputeWithCategoryScores(
        IEnumerable<IReadOnlyDictionary<string, object?>> payloadCategories)
    {
        var categories = payloadCategories
            .Select(c => new ReportCategory(
                c.GetValueOrDefault("id")?.ToString() ?? "",
                c.GetValueOrDefault("name")?.ToString() ?? "",
                c.TryGetValue("score", out var s) && s is int or double or float ? Convert.ToInt32(s) : null,
                [],
                []))
            .ToList();

        return ComputeWithCategoryScores(categories);
    }
}
